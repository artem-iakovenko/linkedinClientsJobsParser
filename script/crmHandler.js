const axios = require('axios');
let requestConfig;


function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}


async function parseLinkedinUrl(unformattedUrl) {
    if (unformattedUrl[unformattedUrl.length - 1] == '/') {
        return unformattedUrl.slice(0, -1);
    }
    return unformattedUrl;
}

async function getAccessToken(crmConfig) {
    refreshUrl = `https://accounts.zoho.com/oauth/v2/token?refresh_token=${crmConfig.refreshToken}&client_id=${crmConfig.clientId}&client_secret=${crmConfig.clientSecret}&grant_type=refresh_token`
    let response = await axios.post(refreshUrl);
    if (response.status == 200) {
        return response.data.access_token;
    }
    return false;
}

async function getDataFromCv(cvModule, crmConfig) {
    let allRecords = [];
    let page = 1;
    while (true) {
        let pageData = [];
        try {
            let moduleUrl;
            if (cvModule == 'potentials') {
                moduleUrl = `${crmConfig.potentialsUrl}${crmConfig.potentialsCvId}&per_page=200&page=${page}`;
            } else if (cvModule == 'leads') {
                moduleUrl = `${crmConfig.leadsUrl}${crmConfig.leadsCvId}&per_page=200&page=${page}`;
            }
            let response = await axios.get(moduleUrl, requestConfig);
            let pageData = response.data.data;
            allRecords.push.apply(allRecords, pageData);
        } catch (e) {
            pageData = [];
        }
        if (pageData.length < 200) {
            break;
        }
        page += 1;
    }
    return allRecords;
}


async function getPotentialsExtraInfo(crmConfig, potentials, onlyJobs) {
    let potentialsMap = {};
    let potentialCounter = 1;
    for (let potential of potentials) {
        potentialCounter += 1;
        let potentialData = {};
        try {
            let potentialUrl = `${crmConfig.potentialsUrlByID}` + potential.id;
            let response = await axios.get(potentialUrl, requestConfig);
            potentialData = response.data.data[0];
            let potentialName = potentialData.Deal_Name;


            let potentialAccId = potentialData.Account_Name.id;
            let accountDetailsResponse = await axios.get(`${crmConfig.accountDetailsUrl}` + potentialAccId, requestConfig);
            let accountDetailsData = accountDetailsResponse.data.data[0];
            let accountLinkedIn = false;
            if (accountDetailsData.Account_LinkedIn_Url !== null) {
                accountLinkedIn = await parseLinkedinUrl(accountDetailsData.Account_LinkedIn_Url);
            }
            if (!accountLinkedIn) {
                continue;
            }
            potentialData = {
                "name": potentialName,
                "accountLinkedIn": accountLinkedIn
            };
            potentialsMap[potential.id] = potentialData;
        } catch (e) {
            continue;
        }
    }
    return potentialsMap;
}


async function getInputData(crmConfig) {
    let accessToken = await getAccessToken(crmConfig);
    requestConfig = { headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` } };
    if (!accessToken) {
        return false;
    }
    let potentials = await getDataFromCv("potentials", crmConfig);
    return {
        "potentials": await getPotentialsExtraInfo(crmConfig, potentials)
    };
}



async function parseJobUrl (jobUrl) {
    try {
        let urlList = jobUrl.split("?");
        return urlList[0];
    } catch (e) {
        return jobUrl;
    }
}


async function getCurrentDate() {
    const date = new Date();
    
    let dayUnf = date.getDate();
    let monthUnf = date.getMonth() + 1;
    let day = dayUnf < 10 ? "0" + dayUnf : dayUnf;
    let month = monthUnf < 10 ? "0" + monthUnf : monthUnf;
    let year = date.getFullYear();
    return `${year}-${month}-${day}`;
}

async function preparePostData(potentialsObjs) {
    let currentDate = await getCurrentDate();
    let postData = [];
    for (let potentialId of Object.keys(potentialsObjs)) {
        let potentialPostData = {};
        let potentialJobs = potentialsObjs[potentialId].jobs;
        let jobsPostData = [];
        for (let job of potentialJobs) {
            let jobMap = {
                "Source": "LinkedIn",
                "Status": "Active",
                "Position_Name": job.jobTitle,
                "URL": job.jobLink,
                "Published_Date": job.postedDate,
                "Technologies": job.technologies,
                "Added_Date": currentDate
            };
            jobsPostData.push(jobMap);
        }
        postData.push({"Open_Jobs": jobsPostData, "id": potentialId});
    }
    return {"data": postData, "skip_mandatory": true};
}



async function updateTabularSection (postData) {
    let moduleUrl = "https://www.zohoapis.com/crm/v2/Deals";
    let response = await axios.put(moduleUrl, postData,requestConfig);
    return response.status;
}



async function updatePotentials(crmConfig, potentialsResults) {
    let updateData = await preparePostData(potentialsResults.potentials);
    console.log(updateData);
    let accessToken = await getAccessToken(crmConfig);
    requestConfig = { headers: { "Authorization": `Zoho-oauthtoken ${accessToken}` } };
    await updateTabularSection(updateData);
}



module.exports = { getInputData, updatePotentials };