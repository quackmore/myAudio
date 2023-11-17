const winston = require('winston');
const config = require('config'); 
const packageJSON = require("../package.json");

const console_log = config.get('logger.console_log');


if (console_log === "ON") {
  var options = {
    file: {
      level: 'info',
      filename: `${config.get('logger.log_path')}/${packageJSON.name}.log`,
      handleExceptions: true,
      maxsize: 5242880, // 5MB
      maxFiles: 100,
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD hh:mm:ss.SSS',
        }),
        winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
      ),
    },
    console: {
      level: 'debug',
      handleExceptions: true,
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({
          format: 'YYYY-MM-DD hh:mm:ss.SSS',
        }),
        winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
      ),
    },
  }
  var logger = winston.createLogger({
    levels: winston.config.npm.levels,
    transports: [
      new winston.transports.File(options.file),
      new winston.transports.Console(options.console)
    ],
    exitOnError: false, // do not exit on handled exceptions
  })
} else {
  var options = {
    file: {
      level: 'info',
      filename: `${config.get('logger.log_path')}/${packageJSON.name}.log`,
      handleExceptions: true,
      maxsize: 5242880, // 5MB
      maxFiles: 100,
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD hh:mm:ss.SSS',
        }),
        winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
      ),
    },
  }
  var logger = winston.createLogger({
    levels: winston.config.npm.levels,
    transports: [
      new winston.transports.File(options.file),
    ],
    exitOnError: false, // do not exit on handled exceptions
  })
}

module.exports = logger;