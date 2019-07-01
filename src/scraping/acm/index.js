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
const tab_map = {
    abstract: "11",
    authors: "14",
    references: "15",
    cited_by: "16",
    index_terms: "17",
    publication: "18",
    reviews: "19",
    comments: "20",
    table_of_contents: "21"
};

// GENERAL UTILITY FUNCTIONS

function log_read(content) {
    process.stdout.write("reading " + content + "...");
}

function log_snippet(result, quotes = true) {
    let snippet = "failed to create snippet";
    switch (typeof result) {
        case "string":
            let ellipse = result.length > sample_line_char_max;
            let i = sample_line_char_max;
            if (ellipse) {
                while (result[i] != " " && i < -1) {
                    i--;
                }
            }
            snippet = `${result.substring(0, i + 1).trim()}${ellipse ? "..." : ""}`;
            snippet = quotes ? `"${snippet}"` : snippet;
            break;
        case "object":
            if (Array.isArray(result)) {
                snippet = result.map(res => {
                    switch (typeof res) {
                        case "string":
                            return res.substring(0, sample_line_char_max / result.length);
                        case "object":
                            return res[Object.keys(res)[0]];
                    }
                }).join(', ');
            } else {
                snippet = result[Object.keys(result)[0]];
            }
    }
    console.log(snippet);
    return result;
}

// DRIVER UTILITY FUNCTIONS

async function navigate_to(url) {
    await driver.get(url);
    await driver.sleep(driver_pause);
}

async function click_on(ref) {
    await (await locate(ref)).click();
    await driver.sleep(driver_pause);
}

async function click_on_acm_tab(target) {
    await click_on(`//*[@id="tab-10${tab_map[target]}-btnInnerEl"]/span`);
}

async function locate(ref, multiple = false) {
    let locator = ref.startsWith("//") ? By.xpath(ref) : By.id(ref);
    return await multiple ? driver.findElements(locator) : driver.findElement(locator);
}

async function text_of(ref) {
    let element = await locate(ref);
    return await element.getText();
}

async function text_of_all(ref) {
    let elements = await locate(ref, true);
    let results = [];
    for (let element of elements) {
        results.push(await element.getText());
    }
    return results;
}

async function logged_assign(key, value) {
    log_read(key);
    result[key] = log_snippet(value);
}

// TEXT SCRAPING

async function read_authors() {
    let authors = await text_of('//*[@id="tabpanel-1009-body"]');
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

    return all_authors;
}

async function read_publication() {
    let publciation_elements = (await text_of("source-body")).split("\n");
    let publication_module = {};
    for (let element of publciation_elements) {
        if (element.startsWith("Title")) {
            publication_module.title = element.substring(6);
        }
    }
    return publication_module;
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
    console.log();
    let output = "";
    results.forEach(res => output += (JSON.stringify(res, null, 4) + "\n"));

    writeFile("./results.txt", output, function errorHandler(exception) {
        console.log(exception || "scraped references successfully written as JSON to ./results.txt");
    });
}

async function scrape_targets(error, data) {
    if (error) {
        console.log("\nUnable to collect target citations from a citations.txt file stored in this directory.\nPlease make sure one is provided.");
        return;
    }

    let references = data.split("\n").map(entry => entry.replace("\r", "")).filter(line => line.match(/\d+/g));
    let quota = references.length;
    log_snippet(`found ${quota} references to scrape`, false);

    driver = await new Builder().forBrowser(target_browser).build();

    for (let i = 0; i < quota; i++) {
        try {
            result = {};

            let id = references[i];
            let url = `https://dl.acm.org/citation.cfm?id=${id}`;
            console.log(`\nscraping ${i + 1}/${quota} (${id})`);

            await navigate_to(url);

            logged_assign("url", url);
            logged_assign("title", await text_of('//*[@id="divmain"]/div/h1'));
            logged_assign("abstract", (await text_of_all("abstract-body")).join(" "));

            await click_on_acm_tab("authors");
            logged_assign("authors", (await read_authors()).map(parse_authors));

            await click_on_acm_tab("publication");
            logged_assign("publication", await read_publication());
        } catch (e) {
            console.log(e);
            await driver.quit();
        }

        results.push(result);
    }

    write_results();

    await driver.quit();
}

let driver;
let results = [];
let result = {};

log_read("target references");

readFile("./citations.txt", {
    encoding: "utf8"
}, scrape_targets);