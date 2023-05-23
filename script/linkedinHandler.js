const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
let keywords;
let cfgLi;
let liSelectors;



async function pageScroller(page, selector, step, tries, sleep) {
    for (let t = 1; t <= tries; t++) {
        await page.evaluate(({ selector, step }) => {
            if (!selector) {
                window.scrollBy(0, step);
            }
        }, { selector, step });
        await page.waitForTimeout(sleep);
    }
}


async function login(page, linkedinConfig) {
    await page.goto(linkedinConfig.feedUrl, { waitUntil: 'domcontentloaded' });
    try {
        await page.waitForSelector('a[href*="artemiakovenko"]', { timeout: 10000 });
    } catch (e) {
        console.log('Please log in and navigate to Feed Page');
        await page.waitForSelector('a[href*="artemiakovenko"]', { timeout: 0 });
        return;
    }

}




async function parseJobUrl (jobUrl) {
    try {
        let urlList = jobUrl.split("?");
        return urlList[0];
    } catch (e) {
        return jobUrl;
    }
}


async function parse_technologies(job_details) {
    let array_str = (job_details.replaceAll(/\n/g, ' ').replaceAll(/  +/g, ' ').replaceAll('/', ' ')).split(' ');
    let found_techs = [];
    for (let w = 0; w < array_str.length; w++) {
        let current_word = array_str[w].replaceAll('(', '').replaceAll(')', '').replaceAll(';', '').replaceAll(':', '').replaceAll('!', '').replaceAll("'", "").replaceAll('"', '').replaceAll(',', '');
        var lastLetter = current_word[current_word.length - 1];
        if (lastLetter == ".") {
            current_word = current_word.slice(0, -1);
        }
        if (keywords.hasOwnProperty(current_word.toLowerCase())) {
            found_techs.push(keywords[current_word.toLowerCase()])
        }

    }
    return [...new Set(found_techs)];
}


async function stringifyTechnologies(techs) {
    let relevantTechs = [];
    for (let tech of techs) {
        if (tech != '') {
            relevantTechs.push(tech);
        }
    }
    return relevantTechs.join(', ');
}

async function getJobs(page, accountUrl, linkedinConfig) {
    let jobsResult = [];
    if (!accountUrl) {
        return jobsResult;
    }
    let jobsUrl = `${accountUrl}/jobs/`.replaceAll("//", "/");
    await page.goto(jobsUrl, { waitUntil: 'domcontentloaded' });

    try {
        await page.waitForSelector('.org-top-card', { visible: true, timeout: 15000 });
    } catch (e) {
        return [];
    }

    let areJobs = false;
    try {
        await page.waitForSelector('.org-jobs-recently-posted-jobs-module__show-all-jobs-btn a', { visible: true, timeout: 5000 });
        areJobs = true
    } catch (e) {
        // no need to do anything
    }
    if (!areJobs) {
        return jobsResult;
    }
    await page.waitForTimeout(4000);
    let jobDetailsLinkUnf = await page.$eval('.org-jobs-recently-posted-jobs-module__show-all-jobs-btn a', jobDetails_link => jobDetails_link.href);
    //let jobDetailsLink = `${jobDetailsLinkUnf.replace('&origin=COMPANY_PAGE_JOBS_CLUSTER_EXPANSION', '')}${linkedinConfig.job_function}${linkedinConfig.keywords}&sortBy=DD`;

    jobDetailsLinkUnf = jobDetailsLinkUnf.split("&")[0];
    console.log(jobDetailsLinkUnf);
    // let jobDetailsLink = `${jobDetailsLinkUnf}${linkedinConfig.job_function}${linkedinConfig.keywords}&sortBy=DD`;
    let jobDetailsLink = `${jobDetailsLinkUnf}&geoId=92000000&f_F=it%2Ceng&keywords=developer%20OR%20engineer&sortBy=DD`;
    //let jobDetailsLink = `${jobDetailsLinkUnf}`;

    await page.goto(jobDetailsLink, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.job-card-container .job-card-list__title', { visible: true, timeout: 0 });
    try {
        await page.waitForSelector('small.jobs-search-results-list__text', { visible: true, timeout: 10000 });
    } catch (e) {
        return jobsResult;
    }
    let totalJobs = await page.$eval('small.jobs-search-results-list__text', totalJobs => totalJobs.innerText);
    totalJobs = totalJobs.replaceAll(' results', '').replaceAll(' result', '').replaceAll(',', '');

    if (Number(totalJobs) == 0) {
        return jobsResult;
    }

    let scrollHeight = await page.evaluate(() => {
        return document.querySelector('.jobs-search-results-list').scrollHeight;
    });

    let scrollStep = 200;
    let stopIndex = 10;
    let startIndex = 1;


    while (true) {
        if (startIndex == stopIndex) {
            break;
        }
        await page.evaluate((step) => {
            let scrollable_div = document.querySelector('.jobs-search-results-list');
            scrollable_div.scrollBy(0, step);
        }, scrollStep);
        await page.waitForTimeout(1000);
        let loadedJobs = (await page.$$('.job-card-container .job-card-list__title')).length;
        if (loadedJobs >= 10 || loadedJobs == Number(totalJobs)) {
            break;
        }
        await page.waitForTimeout(1000);
        startIndex += 1;
    }

    let jobs = await page.$$('.job-card-container .job-card-list__title');
    let alreadyCollected = [];
    for (let l = 0; l < 15; l++) {
        try {
            await jobs[l].click();
        } catch (e) {
            return jobsResult;
        }
        await page.waitForTimeout(4000);
        await page.waitForSelector('.jobs-search__job-details--container', { visible: true, timeout: 0 });
        // PARSE DATA
        let jobTitle = await page.$eval('h2[class*="job-title"]', job_title => job_title.innerText);
        let jobLink = await page.$eval('.jobs-search__job-details--container a[href*="jobs/view/"]', job_link => job_link.href);
        jobLink = await parseJobUrl(jobLink);

        let postedDate = await page.$eval('span[class*="posted-date"]', posted_date => posted_date.innerText);
        let jobLocationUnf = await page.$eval('.jobs-unified-top-card__bullet', job_location => job_location.innerText);
        let jobLocation = jobLocationUnf.substring(1, jobLocationUnf.length - 1);
        let jobType = await page.$eval('.jobs-unified-top-card__job-insight', job_type => job_type.innerText);
        let jobDetailsUnf = await page.$eval('#job-details', job_details => job_details.innerText);
        let jobDetails = `${jobTitle} ${jobDetailsUnf}`;
        let technologies = await parse_technologies(jobDetails);
        let tech1 = "";
        let tech2 = "";
        let job_info;
        if (technologies.length > 0 && !alreadyCollected.includes(jobLink)) {
            let jobObj = {
                "jobTitle": jobTitle,
                "jobLink": jobLink,
                "postedDate": postedDate,
                "technologies": await stringifyTechnologies(technologies)
            };
            console.log(jobObj);
            jobsResult.push(jobObj);
            alreadyCollected.push(jobLink);
            if (jobsResult.length == 10) {
                break;
            }
        }
        await page.waitForTimeout(5000);
    }
    return jobsResult;
}





async function linkedinLauncher(verificationDetails, linkedinConfig) {
    cfgLi = linkedinConfig;
    liSelectors = cfgLi.selectors;
    keywords = linkedinConfig.technologies;
    let potentialsObjects = verificationDetails.potentials;
    if (potentialsObjects === undefined) {
        return false;
    } 
    const browser = await puppeteer.launch({
        userDataDir: "../chromeData",
        headless: false
    });
    const page = await browser.newPage();
    await login(page, linkedinConfig);

    await page.waitForTimeout(10000);
    if (potentialsObjects !== undefined) {
        for (let entryId of Object.keys(potentialsObjects)) {
            dataObj = potentialsObjects[entryId];
            let accountJobs = await getJobs(page, dataObj.accountLinkedIn, linkedinConfig);
            console.log(accountJobs);
            verificationDetails.potentials[entryId].jobs = accountJobs;
            await page.waitForTimeout(5000);
        }
    }
    await browser.close();
    return verificationDetails;
}

module.exports = { linkedinLauncher };