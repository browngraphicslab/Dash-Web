const {
    Builder,
    By
} = require('selenium-webdriver');
const {
    readFile,
    writeFile
} = require('fs');

const driver_pause = 500; // milliseconds
const sample_line_char_max = 100; // characters
const target_browser = 'chrome';

// GENERAL UTILITY FUNCTIONS

function log_read(content) {
    process.stdout.write("reading " + content + "...");
}

function log_snippet(result) {
    let ellipse = result.length > sample_line_char_max;
    let i = sample_line_char_max;
    if (ellipse) {
        while (result[i] != " " && i < -1) {
            i--;
        }
    }
    console.log(` "${result.substring(0, i + 1).trim()}${ellipse ? "..." : ""}"`);
}

// DRIVER UTILITY FUNCTIONS

async function navigate_to(url) {
    await driver.get(url);
    await driver.sleep(driver_pause);
}

async function click_on(xpath) {
    await driver.findElement(By.xpath(xpath)).click();
    await driver.sleep(driver_pause);
}

// TEXT SCRAPING

async function read_title() {
    log_read("title");
    let title_el = await driver.findElement(By.xpath('//*[@id="divmain"]/div/h1'));
    let title = await title_el.getText();
    log_snippet(title);
    return title;
}

async function read_abstract() {
    log_read("abstract");
    let lines = [];
    let webElements = await driver.findElements(By.id("abstract-body"));
    for (let el of webElements) {
        let text = await el.getText();
        lines.push(text);
    }
    let abstract = lines.join(" ");
    log_snippet(abstract);
    return abstract;
}

async function read_authors() {
    log_read("authors");
    await click_on('//*[@id="tab-1014-btnInnerEl"]/span');

    let authors_el = await driver.findElement(By.xpath('//*[@id="tabpanel-1009-body"]'));
    let authors = await authors_el.getText();
    let sanitize = line => line.length > 0 && !(line.startsWith("No contact information") || line.startsWith("View colleagues of") || line.startsWith("Bibliometrics:"));
    let author_lines = authors.split("\n").map(line => line.trim()).filter(sanitize);

    let all_authors = [];
    let i = 0;
    while (i < author_lines.length) {
        let individual = [];
        while (!author_lines[i].startsWith("Average citations")) {
            individual.push(author_lines[i]);
            i++;
        }
        individual.push(author_lines[i]);
        all_authors.push(individual);
        i++;
    }

    let multiple = all_authors.length == 1 ? "" : " et al.";
    log_snippet(all_authors[0][0] + multiple);
    return all_authors;
}

// JSON / DASH CONVERSION AND EXPORT

function parse_authors(metadata) {
    let publicationYears = metadata[1].substring(18).split("-");
    author = {
        name: metadata[0],
        publication_start: parseInt(publicationYears[0]),
        publication_end: parseInt(publicationYears[1])
    };
    for (let count = 2; count < metadata.length; count++) {
        let attr = metadata[count];
        let char = attr.length - 1;
        while (attr[char] != " ") {
            char--;
        }
        let key = attr.substring(0, char).toLowerCase().replace(/ /g, "_").replace(/[\(\)]/g, "");
        let value = parseFloat(attr.substring(char + 1).replace(/,/g, ""));
        author[key] = value;
    }
    return author;
}

function write_results() {
    let output = "";
    results.forEach(res => output += (JSON.stringify(res, null, 4) + "\n"));

    writeFile("./results.txt", output, function errorHandler(exception) {
        console.log(exception || "scraped references successfully written as JSON to ./results.txt\n");
    });
}

async function scrape_targets(error, data) {
    if (error) {
        console.log("\nUnable to collect target citations from a citations.txt file stored in this directory.\nPlease make sure one is provided.");
        return;
    }

    let references = data.split("\n").map(entry => entry.replace("\r", "")).filter(line => line.match(/\d+/g));
    let quota = references.length;
    console.log(`${references.join(", ")}\n`);

    driver = await new Builder().forBrowser(target_browser).build();

    for (let i = 0; i < quota; i++) {
        let result = {};

        try {
            let url = `https://dl.acm.org/citation.cfm?id=${references[i]}`;
            await navigate_to(url);
            console.log(`scraping ${i + 1}/${quota} (${url})`);

            result.url = url;
            result.title = await read_title();
            result.abstract = await read_abstract();
            result.authors = (await read_authors()).map(parse_authors);
        } catch (e) {
            console.log(e);
            await driver.quit();
        }

        results.push(result);
        console.log();
    }

    write_results();

    await driver.quit();
}

let driver;
let results = [];
console.log("reading references...");
readFile("./citations.txt", {
    encoding: "utf8"
}, scrape_targets);