const { Builder, By, Key, until } = require('selenium-webdriver');
const fs = require("fs");

let driver;
fs.readFile("./citations.txt", { encoding: "utf8" }, scrapeTargets);
results = []

async function scrapeTargets(error, data) {
    if (error) {
        console.log("\nUnable to collect target citations from a citations.txt file stored in this directory.\nPlease make sure one is provided.")
        return;
    }

    driver = await new Builder().forBrowser('chrome').build();

    let references = data.split("\n").map(entry => entry.replace("\r", "")).filter(line => line.match(/\d+/g));

    let results = []
    let pdfs = []
    for (let id of references) {
        let result = {}
        let lines = []
        try {
            let url = `https://dl.acm.org/citation.cfm?id=${id}`;
            await driver.get(url);
            await driver.sleep(500)
            let candidates = await driver.findElements(By.xpath('.//a[contains(@href,  "ft_gateway.cfm?id=")]'));
            if (candidates.length > 0) {
                pdfs.push(candidates[0])
            }
            let webElements = await driver.findElements(By.id("abstract-body"))
            for (let el of webElements) {
                let text = await el.getText()
                lines.push(text)
            }
            result.url = url
            result.abstract = lines.join(" ");
            await driver.findElement(By.xpath(`//*[@id="tab-1014-btnInnerEl"]/span`)).click()
            await driver.sleep(500)
            let authors = await driver.findElement(By.xpath('//*[@id="tabpanel-1009-body"]')).getText()
            let sanitize = line => line.length > 0 && !(line.startsWith("No contact information") || line.startsWith("View colleagues of") || line.startsWith("Bibliometrics:"))
            authorLines = authors.split("\n").map(line => line.trim()).filter(sanitize)

            let i = 0;
            let allAuthors = []
            while (i < authorLines.length) {
                let individual = [];
                while (!authorLines[i].startsWith("Average citations")) {
                    individual.push(authorLines[i])
                    i++
                }
                individual.push(authorLines[i])
                allAuthors.push(individual);
                i++
            }
            result.authors = allAuthors.map(metadata => {
                let publicationYears = metadata[1].substring(18).split("-");
                author = {
                    name: metadata[0],
                    publication_start: parseInt(publicationYears[0]),
                    publication_end: parseInt(publicationYears[1])
                };
                for (let count = 2; count < metadata.length; count++) {
                    let attr = metadata[count]
                    let char = attr.length - 1;
                    while (attr[char] != " ") {
                        char--
                    }
                    let key = attr.substring(0, char).toLowerCase().replace(/ /g, "_").replace(/[\(\)]/g, "");
                    let value = parseFloat(attr.substring(char + 1).replace(/,/g, ""));
                    author[key] = value
                }
                return author
            })
        } catch (e) {
            console.log(e)
            await driver.quit();
        }
        results.push(result)
    }

    let output = "";
    results.forEach(res => output += (JSON.stringify(res, null, 4) + "\n"));

    fs.writeFile("./results.txt", output, function errorHandler(exception) { console.log(exception || "results successfully written") })

    await driver.quit();
}