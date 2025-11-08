(function(window, document) {
    var TVGWidget = {
      mount: function(target, options) {
        options = options || {};
        var el = (typeof target === 'string')
          ? document.querySelector(target)
          : target;
  
        if (!el) {
          if (window.console && console.error) {
            console.error('[TVGWidget] Target not found:', target);
          }
          return;
        }
  
        // Always load the local embed.html
        var srcBase = options.src || 'embed.html';
  
        var params = [];
        if (options.whiteLabel === true) params.push('whiteLabel=true');
        if (options.accent) params.push('accent=' + encodeURIComponent(options.accent));
  
        var src = srcBase + (params.length ? '?' + params.join('&') : '');
  
        var iframe = document.createElement('iframe');
        iframe.src = src;
        iframe.loading = 'lazy';
        iframe.style.width = '100%';
        iframe.style.minHeight = (options.minHeight || 640) + 'px';
        iframe.style.border = '0';
        iframe.style.borderRadius = (options.borderRadius || 16) + 'px';
        iframe.style.boxShadow = options.boxShadow || '0 18px 45px rgba(0,0,0,.45)';
        iframe.setAttribute('title', options.title || 'Ticket VeriGuard Listing Checker');
  
        el.innerHTML = '';
        el.appendChild(iframe);
      }
    };
  
    window.TVGWidget = TVGWidget;
  })(window, document);
  