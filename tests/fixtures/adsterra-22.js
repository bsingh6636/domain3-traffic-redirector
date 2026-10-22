// Rendering contract from the operator-supplied /22/ response.
// The creative is replaced; all live images, click URLs and beacons are omitted.
(function() {
  var template = '<div style="width:300px;height:250px;background:#e1e8d4;display:grid;place-content:center;text-align:center;font:16px system-ui;color:#213b32"><strong>Ad loader verified</strong><p>Test creative - 300 x 250</p></div>';
  if (typeof atAsyncContainers === 'object' && atAsyncContainers['955abbcef9875699b2d2ebba8f8a109d']) {
    var container, scripts;
    if (container = document.getElementById(atAsyncContainers['955abbcef9875699b2d2ebba8f8a109d'])) {
      container.innerHTML = template;
      scripts = container.getElementsByTagName('script');
      for (var i = 0; i < scripts.length; i++) {
        if (!!scripts[i].src) {
          (function(raw) {
            var script = document.createElement('script');
            for (var j = 0, length = raw.attributes.length; j < length; j++) {
              script[raw.attributes[j]['name']] = raw.attributes[j]['value'];
            }
            raw.parentNode.replaceChild(script, raw);
          })(scripts[i]);
        } else {
          eval(scripts[i].innerHTML);
        }
      }
    }
  }
})();
