const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

const BASE_URL = 'https://ranobelib.me/ru/122448--shadow-slave/read';
const BID = 13947;
const START_CHAPTER = 0;
const END_CHAPTER = 10;
let VERSIONS = [0, 1, 2, 3, 4, 5];
const DELAY = 2000;

let titles = {};
const titlesPath = 'titles.json';
async function loadTitles() {
  try {
    const data = await fs.readFile(titlesPath, 'utf-8');
    titles = JSON.parse(data);
  } catch (e) {
    titles = {};
  }
}
async function saveTitles() {
  await fs.writeFile(titlesPath, JSON.stringify(titles, null, 2), 'utf-8');
}
function processLines(paragraph) {
  paragraph = paragraph.replace(/—{7,}/g, '***');
  return paragraph;
}

let successCount = {};
let lastVersion = null;
function updateVersions(currentVersion) {
  if (!(currentVersion in successCount)) successCount[currentVersion] = 0;
  if (currentVersion === lastVersion) {
    successCount[currentVersion] += 1;
  } else {
    successCount[currentVersion] = 1;
  }
  lastVersion = currentVersion;
  if (successCount[currentVersion] >= 2) {
    VERSIONS = [currentVersion].concat(VERSIONS.filter(v => v !== currentVersion));
    successCount[currentVersion] = 0;
  }
}

function extractTitle(rawTitle) {
  const match = rawTitle.match(/- (.+)$/);
  return match ? match[1].trim() : rawTitle.trim();
}

(async () => {
  await loadTitles();

  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  async function waitForContentOr404(page) {
    return Promise.race([
      page.waitForSelector('div.errors-page', { timeout: 15000 }).then(() => '404'),
      page.waitForSelector('div.lp_aj h1.lp_bu', { timeout: 15000 }).then(() => 'content')
    ]);
  }

  for (let chapter = START_CHAPTER; chapter <= END_CHAPTER; chapter++) {
    if (titles.hasOwnProperty(chapter)) {
      console.log(`Глава ${chapter} уже скачана, пропускаем.`);
      continue;
    }
    let success = false;
    for (let v of VERSIONS) {
      const url = `${BASE_URL}/v${v}/c${chapter}?bid=${BID}`;
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        const result = await waitForContentOr404(page);

        if (result === '404') {
          console.log(`Глава ${chapter} версия v${v} - страница 404, пропускаем.`);
          continue;
        }

        await new Promise(r => setTimeout(r, 1500));

        const rawTitle = await page.$eval('div.lp_aj h1.lp_bu', el => el.textContent);
        const title = extractTitle(rawTitle);

        let paragraphs = await page.$$eval('main.lp_b div.text-content p[data-paragraph-index]', nodes =>
          nodes.map(n => n.textContent.trim().replace(/\n+/g, ' '))
        );
        paragraphs = paragraphs.map(processLines);
        const markdown = paragraphs.join('\n\n');

        await fs.writeFile(path.join('chapters', `${chapter}.md`), markdown, 'utf-8');
        titles[chapter] = title;
        await saveTitles();

        console.log(`Глава ${chapter} (${title}) успешно сохранена.`);
        updateVersions(v);
        success = true;
        break;
      } catch (e) {
        console.warn(`Глава ${chapter} не найдена или ошибка: ${e.message}`);
      }
    }
    if (!success) {
      console.warn(`Глава ${chapter} не найдена ни в одной из версий.`);
    }
    await new Promise(r => setTimeout(r, DELAY));
  }

  await browser.close();
})();
