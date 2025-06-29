const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

const BASE_URL = 'https://ranobelib.me/ru/122448--shadow-slave/read'; // базовая ссылка
const BID = 13947; // переводчик
const START_CHAPTER = 0; // с какой начинаем
const END_CHAPTER = 450; // на какой заканчиваем
const VERSIONS = [1, 2, 0, 3, 4, 5]; // версии
const DELAY = 2000; // задержка между запросами

// извлечение названия главы
function extractTitle(rawTitle) {
  const match = rawTitle.match(/- (.+)$/);
  return match ? match[1].trim() : rawTitle.trim();
}

(async () => {
  const browser = await puppeteer.launch({headless: false});
  const page = await browser.newPage();
  const titles = {};

  async function waitForContentOr404(page) {
    return Promise.race([
      page.waitForSelector('div.errors-page', { timeout: 15000 }).then(() => '404'),
      page.waitForSelector('div.lp_aj h1.lp_bu', { timeout: 15000 }).then(() => 'content')
    ]);
  }

  for (let chapter = START_CHAPTER; chapter <= END_CHAPTER; chapter++) {
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

        // Пауза для динамического контента
        await new Promise(r => setTimeout(r, 1500));

        const rawTitle = await page.$eval('div.lp_aj h1.lp_bu', el => el.textContent);
        const title = extractTitle(rawTitle);

        const paragraphs = await page.$$eval('main.lp_b div.text-content p[data-paragraph-index]', nodes =>
          nodes.map(n => n.textContent.trim())
        );
        const markdown = paragraphs.join('\n\n');

        await fs.writeFile(path.join('chapters', `${chapter}.md`), markdown, 'utf-8');
        titles[chapter] = title;

        console.log(`Глава ${chapter} (${title}) успешно сохранена.`);
        success = true;
        break;
      } catch (e) {
        console.warn(`Глава ${chapter} не найдена или ошибка: ${e.message}`);
      }
    }
    await new Promise(r => setTimeout(r, DELAY));
  }

  // названия глав в файл
  await fs.writeFile('titles.json', JSON.stringify(titles, null, 2), 'utf-8');
  await browser.close();
})();
