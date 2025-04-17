// Create an HTTPS agent that will not reject unauthorized SSL certificates
const https = require('https');
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const port = 3000;
const fs = require('fs');
const express = require('express');

global.currentTime = function() {
  return '[' + new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ']';
};

class Logger {
  static log_level = 0;

  constructor(level=0) {
    Logger.log_level = level;
  }
  debug(msg, ...args) {
    if (Logger.log_level >= 3)
      console.debug(msg, args);
  }
  info(msg, ...args) {
    if (Logger.log_level >= 2)
      console.info(msg, args);
  }
  warn(msg, ...args) {
    if (Logger.log_level >= 1)
      console.warn(msg, args);
  }
  error(msg, ...args) {
    if (Logger.log_level >= 0)
      console.error(msg, args);
  }
  log(msg, ...args) {
    console.log(msg, args);
  }
};

const app = express();
const dev_server = 'Ballantyne DEV server';
const dev_host = 'dev.k8s.home';
const prod_server = 'Ballantyne PROD server';
const prod_host = 'prod.k8s.home';
const host_definitions = 'web.json';
const logger = new Logger(2);
let jsonData;
let count = -1;
 
// Serve static files (e.g., images)
app.use(express.static('public'));

// Middleware to determine environment
app.use((req, res, next) => {
  const host = req.get('host');
  res.locals.banner = host.includes(prod_host)
    ? prod_server
    : dev_server;
  next();
});

// Endpoint to render the page
app.get('/', async (req, res) => {
  const banner = res.locals.banner;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  try {
    // Read json which defines all possible buttons
    jsonData = JSON.parse(fs.readFileSync(host_definitions, 'utf-8'));
  } catch (error) {
    return res.status(500).send('Error reading JSON file');
  }

  // Verify URLs
  const validElements = await Promise.all(
    jsonData.map(async (item) => {
      if (item.break) {
        return `<div class="box right" style="width: auto;"></div>
</div>
</div>
</div>
<div class="row vspace" style="width: 100%;"></div>
<div class="row center">
<div class="table center" style="width: auto;">
<div class="row center">
<div class="box left" style="width: auto;"></div>`;
      }
      count++;
      return `<div id="${item.id}"></div>`;
    })
  );

  // Filter out null results
  const validButtons = validElements.filter(Boolean).join('\n');

  // Render the HTML
  const html = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, shrink-to-fit=no" >
    <script type="text/javascript" src="client.js"></script>
    <title>${banner}</title>
    <link rel="stylesheet" type="text/css" href="css/index.css" />
  </head>
  <body onload="init()">
    <div class="table all">
      <div class="header">
        <div class="title center">${banner}</div>
      </div>
      <div class="row main all center">
        <div class="box"></div>
        <div id="menulinks" class="box center middle">
          <div id="main" class="table center" style="width: 100%;">
            <div class="row vspace" style="width: 100%;"></div>
            <div class="row center">
              <div class="table center" style="width: auto;">
                <div class="row center">
                  <div class="box left" style="width: auto;"></div>
                  ${validButtons}
                  <div class="box right" style="width: auto;"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="box"></div>
      </div>
    </div>
  </body>
</html>`;

  res.send(html);
  logger.debug(`${currentTime()} Debug: URLs to verify = ${count}`);
});

app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Verify URLs and send updates
  jsonData.map(async (item) => {
    if (! item.break && item.html != '#') {
      let html_url = item.html;
      if (res.locals.banner === dev_server) {
        html_url = html_url.toString().replace(prod_host, dev_host);
      }
      logger.info(`${currentTime()} Info: checking '${item.text}' ( ${html_url} )`);
      try {
        // Asynchronously fetch the item URL
        let url = new URL(html_url);
        let mode = 'HEAD';
        if (item.mode)
          mode = item.mode;
        const response = await fetch(html_url, { method: mode, agent: httpsAgent, protocol: url.protocol });
        let tm = currentTime();
        if (response.ok || response.statusText != 'Not Found') {
          item.html = html_url;
          item.time = tm;
          let txt = `data: ${JSON.stringify(item)}`;
          logger.info(`${tm} Info: ${txt}`);
          res.write(txt+'\n\n');
        }
        else if(response) {
          let a = '.';
           if (response.statusText)
            a = response.statusText;
          let b = '..';
          if (response.status)
            b = response.status;
          let c = '...';
          if (response.type)
            c = response.type;
          let d = '....';
          if (response.headers)
            d = JSON.stringify(response.headers);
          logger.error(`${tm} Error invalid response '${item.text}' ( ${html_url} ): '${a}', '${b}', '${c}', '${d}'`);
        }
        else {
          logger.error(`${tm} Error invalid response '${item.text}' ( ${html_url} ): 'null response'`);
        }
      } catch (err) {
        // Optionally handle/notify error cases
        logger.error(`${currentTime()} Error fetching '${item.text}' ( ${html_url} ): '${err.code}'`);
      }
      if (--count == 0) {
        const tm = currentTime();
        res.write(`event: finished\ndata: {"time": "${tm}"}\n\n`);
        logger.info(`${tm} Info: finished`);
      }
      logger.debug(`${currentTime()} Debug: URLs still to process = ${count}`);
    }
  });
  
  // Cleanup when connection is closed
  req.on('close', () => {
    res.end();
    logger.info(`${currentTime()} Info: connection closed`);
  });

});

// Start the server
app.listen(port, () => {
  console.log(`${currentTime()} Server running at http://localhost:${port}/`);
});
