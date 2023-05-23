

const readline = require('readline-sync');
const config = require('../config.json');
var fs = require("fs");
const crmHandler = require("./crmHandler.js");
const linkedinHandler = require("./linkedinHandler.js");
const backupData = require('./linkedinBackup.json');


(async () => {

    let crmDataToCheck = await crmHandler.getInputData(config.crm);
    let linkedinResults = await linkedinHandler.linkedinLauncher(crmDataToCheck, config.linkedin);
    //let linkedinResults = backupData;
    await crmHandler.updatePotentials(config.crm, linkedinResults);






    // fs.writeFile("./linkedinBackup.json", JSON.stringify(linkedinResults, null, 4), (err) => {
    //     if (err) {  console.error(err);  return; };
    //     console.log("File has been created");
    // });

})();