// start-up
const log = require('./logger')
const bth = require('./bth')
// const httpd = require('./httpd/httpd')
const config = require('config');
const packageJSON = require("./package.json");

log.info(`${packageJSON.name} started`);

bth.isPowered()
    .then(data => console.log("Bluetooth is " + data))
    .catch(err => console.log(err));

bth.powerChange("on")
    .then(data => console.log(data))
    .catch(err => console.log(err))
    .finally(() => bth.isPowered()
        .then(data => console.log("Bluetooth is " + data))
        .catch(err => console.log(err)));


setInterval(function () {
    bth.isPowered()
        .then(data => console.log("Bluetooth is " + data))
        .catch(err => console.log(err));
}, 20000);

// graceful shutdown
process.on('SIGINT', () => {
    //    httpd.closeAllConnections();
    //    httpd.close();
    log.info(`${packageJSON.name} ended`)
    log.end()
    process.exit(0)
})