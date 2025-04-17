const MENUREF_HEIGHT = 55;  // 57
const MENUREF_WIDTH = 180;  // 156

function btnClick() {
  if (this.title && this.title != '#')
    window.open(this.title, '_self');
}


function init() {
  if(typeof(EventSource) === "undefined") {
    x.innerHTML = "Sorry, no support for server-sent events.";
    return
  }

  const sse = new EventSource("/events");
  sse.onopen = () => {
    console.log("Connection to server opened.");
  };
  sse.onmessage = (event) => {
    console.debug("received event", event);
    try {
      const item = JSON.parse(event.data);
      const div = document.getElementById(item.id);
      if (div && item.html != '#') {
        div.className = "btn";
        div.title = item.html;
        div.style.height = MENUREF_HEIGHT+'px';
        div.style.width = MENUREF_WIDTH+'px';
        div.innerHTML = item.text.replace(': ', '<br>');
        div.addEventListener('click', btnClick, false);
      }
    }
    catch(error) {
      console.error("Error parsing JSON:", error);
    }
  };
  sse.onerror = (event) => {
    if (event.eventPhase == EventSource.CLOSED) {
      sse.close();
      console.info("Event Source Closed", event);
      return;
    }
    console.warn("EventSource failed.", event);
  };
  sse.addEventListener("finished", (event) => {
    console.info('update finished', event);
    sse.close();
  });
}
