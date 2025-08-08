// Create an HTTPS agent that will not reject unauthorized SSL certificates
const https = require('https');
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
//import pLimit from 'p-limit';

global.currentTime = function() {
  return '[' + new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ']';
}

class Logger {
  static log_level() {
    return process.env.LOG_LEVEL || 0;
  }
  debug(msg, ...args) {
    if (Logger.log_level() >= 3)
      console.log(msg, args);
  }
  info(msg, ...args) {
    if (Logger.log_level() >= 2)
      console.log(msg, args);
  }
  warn(msg, ...args) {
    if (Logger.log_level() >= 1)
      console.log(msg, args);
  }
  error(msg, ...args) {
    if (Logger.log_level() >= 0)
      console.log(msg, args);
  }
  log(msg, ...args) {
    console.log(msg, args);
  }
}

const logger = new Logger();
//const limit = pLimit(10); // Adjust concurrency limit as needed
const port = 3000;
const dev_server = 'Ballantyne DEV Server';
const dev_host = 'dev.k8s.home';
const prod_server = 'Ballantyne PROD Server';
const prod_host = 'prod.k8s.home';
const host_definitions = 'web.json';
const div_separator=`<div class="box right" style="width: auto;"></div>
</div>
</div>
</div>
<div class="row vspace" style="width: 100%;"></div>
<div class="row center">
<div class="table center" style="width: auto;">
<div class="row center">
<div class="box left" style="width: auto;"></div>`;

let jsonData;
let count = -1;

// Verify URLs and send updates
async function processUrl(item, banner) {
  if (banner === prod_server && item.text == prod_server) {
    return '';
  }
  else if (banner === dev_server && item.text == dev_server) {
	return '';
  }
  else if (item.break) {
    return div_separator;
  }
  count++;
  return `<div id="${item.id}"></div>`;
}

// Verify URLs and send updates
async function processItem(item, res) {
  if (! (item.hasOwnProperty('text') && item.hasOwnProperty('html')) )
    return;

  if (res.locals.banner === prod_server) {
    if (item.text == prod_server) {
		return;
    }
  }
  else if (res.locals.banner === dev_server) {
    if (item.text == dev_server) {
		return;
    }
    if (item.text != prod_server) {
        item.html = item.html.replace(prod_host, dev_host);
    }
  }

  logger.info(`${currentTime()} Info: checking '${item.text}' ( ${item.html} )`);

  try {
    const url = new URL(item.html);
    const response = await fetch(item.html, {
      method: item.mode || 'HEAD',
      agent: httpsAgent,
      protocol: url.protocol,
    });

    const tm = currentTime();

    if (response.ok || response.statusText !== 'Not Found') {
      item.time = tm;
      const txt = `data: ${JSON.stringify(item)}`;
      logger.info(`${tm} OK: ${txt}`);
      res.write(txt + '\n\n');
    } else {
      logger.warn(`${tm} WARN: '${item.text}' returned ${response.status} (${response.statusText})`);
    }
  } catch (err) {
    logger.error(`${currentTime()} ERROR: '${item.text}' failed: ${err}`);
  }
  count--;
}

function get_html(banner, validButtons) {
  return `
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
}

const fs = require('fs');
const express = require('express');
const app = express();

// directory from which to serve static files (e.g., images)
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
  logger.log(`${currentTime()} LOG_LEVEL: ${Logger.log_level()}`);

  try {
    // Read json which defines all possible buttons
    jsonData = JSON.parse(fs.readFileSync(host_definitions, 'utf-8'));
  } catch (error) {
    return res.status(500).send('Error reading JSON file');
  }

  // Verify URLs
  const validElements = await Promise.all( jsonData.map(item => processUrl(item, res.locals.banner)) );
  // Filter out null results
  const validButtons = validElements.filter(Boolean).join('\n');

  // Render the HTML
  const html = get_html(banner, validButtons);
  res.send(html);
  logger.debug(`${currentTime()} Debug: URLs to verify = ${count}`);
});

app.get('/events', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Wait for all async tasks to complete
  await Promise.all( jsonData.map(item => processItem(item, res)) );

  // Emit finished event
  const tm = currentTime();
  res.write(`event: finished\ndata: {"time": "${tm}"}\n\n`);
  logger.info(`${tm} Info: finished`);

  // Cleanup when connection is closed
  req.on('close', () => {
    res.end();
    logger.log(`${currentTime()} Info: connection closed`);
  });
});

// Start the server
app.listen(port, () => {
  logger.log(`${currentTime()} Server running at http://localhost:${port}/`);
});
