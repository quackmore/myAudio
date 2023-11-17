const { Pool } = require('pg')
const config = require('config');

const pool = new Pool({
  user: `${config.get('db.user')}`,
  host: `${config.get('db.host')}`,
  database: `${config.get('db.database')}`,
  port: config.get('db.port'),
  statement_timeout: 60000
});

module.exports = {
  query: (text, params) => {
    return pool.query(text, params)
  }
};