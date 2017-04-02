const winston = require('winston');

function logContract(contract){
  // pass in the contract abstraction
  var logger = new (winston.Logger)({
    transports: [
      new (winston.transports.File)({
        name: 'info-file',
        filename: 'logs/filelog-info.log',
        level: 'info',
        prettyPrint: true,
        json: false
      })
      // new (winston.transports.Console)()
    ]
  })
  contract.deployed()
    .then(function(instance){
      instance.allEvents({}, function(error, result) {
        if (!error){ // we can make this a lot more pretty if we have time
          logger.info('%s %s', result.event, JSON.stringify(result.args));
        } else {
          logger.error(error);
        }

      });
    })
}

module.exports = {
  logContract
}
