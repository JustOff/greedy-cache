var Cc = Components.classes, Ci = Components.interfaces, Cu = Components.utils;
Cu.import("resource://gre/modules/Services.jsm");

var branch = "extensions.greedy-cache.";
var enabled, enforce, unhideToolbar, useExceptions, domRegex = null, gWindowListener = null;

function listTest(host) {
	if (domRegex === null) {
		try {
			var exceptionList = Services.prefs.getBranch(branch).getComplexValue("exceptionList", Ci.nsISupportsString).data;
			domRegex = new RegExp("^([^.]+\\.)*(" + exceptionList.replace(/(\*\.?|\s+\.?|^\.)/g,"").replace(/;\.?/g,"|").replace(/\./g,"\\.") + ")\\.?$");
		} catch (e) {
			return false;
		}
	}
	return domRegex.test(host);
}

var httpRequestObserver = {
	observe: function (subject, topic, data) {
		if (topic == "http-on-modify-request" && subject instanceof Ci.nsIHttpChannel
				&& subject.loadInfo && subject.loadInfo.contentPolicyType < 5) {
			if (useExceptions && listTest(subject.URI.host)) {
				return;
			}
			subject.loadFlags |= 1024;
		}
	},
	register: function ()
	{
		Services.obs.addObserver(this, "http-on-modify-request", false);
	},
	unregister: function ()  
	{
		Services.obs.removeObserver(this, "http-on-modify-request");  
	}
};

var httpResponseObserver = {
	observe: function (subject, topic, data) {
		if (topic == "http-on-examine-response" && subject instanceof Ci.nsIHttpChannel
				&& subject.loadInfo && subject.loadInfo.contentPolicyType == 3
				&& (subject.isNoCacheResponse() || subject.isNoStoreResponse())) {
			if (useExceptions && listTest(subject.URI.host)) {
				return;
			}
			subject.setResponseHeader("Cache-Control", "max-age=3600", false);
			subject.setResponseHeader("Pragma", "", false);
			subject.setResponseHeader("Expires", "", false);
		}
	},
	register: function ()  
	{
		Services.obs.addObserver(this, "http-on-examine-response", false);
	},
	unregister: function ()  
	{
		Services.obs.removeObserver(this, "http-on-examine-response");
	}
}; 

function $(node, childId) {
	if (node.getElementById) {
		return node.getElementById(childId);
	} else {
		return node.querySelector("#" + childId);
	}
}

function bImg (b, img) {
	b.style.listStyleImage = 'url("chrome://greedy-cache/skin/' + img + '.png")';
}

var button = {
	meta : {
		id : "greedy-cache-button",
		label : "Greedy Cache",
		tooltiptext : "Greedy Cache",
		class : "toolbarbutton-1 chromeclass-toolbar-additional"
	},
	install : function (w) {
		var doc = w.document;
		var b = doc.createElement("toolbarbutton");
		for (var a in this.meta) {
			b.setAttribute(a, this.meta[a]);
		}

		var toolbox = $(doc, "navigator-toolbox");
		toolbox.palette.appendChild(b);

		var {toolbarId, nextItemId} = this.getPrefs(),
			toolbar = toolbarId && $(doc, toolbarId),
			nextItem = toolbar && $(doc, nextItemId);
		if (toolbar) {
			if (nextItem && nextItem.parentNode && nextItem.parentNode.id == toolbarId) {
				toolbar.insertItem(this.meta.id, nextItem);
			} else {
				var ids = (toolbar.getAttribute("currentset") || "").split(",");
				nextItem = null;
				for (var i = ids.indexOf(this.meta.id) + 1; i > 0 && i < ids.length; i++) {
					nextItem = $(doc, ids[i])
					if (nextItem) {
						break;
					}
				}
				toolbar.insertItem(this.meta.id, nextItem);
			}
			if (unhideToolbar && toolbar.getAttribute("collapsed") == "true") {
				w.setToolbarVisibility(toolbar, true);
			}
		}
		return b;
	},
	afterCustomize : function (e) {
		var toolbox = e.target,
			b = $(toolbox.parentNode, button.meta.id),
			toolbarId, nextItemId;
		if (b) {
			var parent = b.parentNode,
				nextItem = b.nextSibling;
			if (parent && parent.localName == "toolbar") {
				toolbarId = parent.id;
				nextItemId = nextItem && nextItem.id;
			}
		}
		button.setPrefs(toolbarId, nextItemId);
	},
	getPrefs : function () {
		var p = Services.prefs.getBranch(branch);
		return {
			toolbarId : p.getCharPref("bar"),
			nextItemId : p.getCharPref("before")
		};
	},
	setPrefs : function (toolbarId, nextItemId) {
		var p = Services.prefs.getBranch(branch);
		p.setCharPref("bar", toolbarId || "");
		p.setCharPref("before", nextItemId || "");
	}
};

var gcacheIn = function (w) {
	var b = button.install(w);

	var windowPrefsWatcher = {
		observe: function (subject, topic, data) {
			if (topic == "nsPref:changed" && data == "enabled") {
				if (Services.prefs.getBranch(branch).getBoolPref("enabled")) {
					bImg(b, "icon");
				} else {
					bImg(b, "icoff");
				}
			}
		},
		register: function () {
			var prefsService = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService);
			this.prefBranch = prefsService.getBranch(branch);
			this.prefBranch.addObserver("", this, false);
		},
		unregister: function () {
			this.prefBranch.removeObserver("", this);
		}
	}

	return {
		init : function () {
			windowPrefsWatcher.register();
			w.addEventListener("aftercustomization", button.afterCustomize, false);
			b.addEventListener("command", this.run, false);
			bImg(b, enabled ? "icon" : "icoff");
		},
		done : function () {
			windowPrefsWatcher.unregister();
			w.removeEventListener("aftercustomization", button.afterCustomize, false);
			b.removeEventListener("command", this.run, false);
			b.parentNode.removeChild(b);
			b = null;
		},
		run : function (e) {
			if (e.ctrlKey || e.metaKey) {
				var mrw = Services.wm.getMostRecentWindow("navigator:browser");
				mrw.BrowserOpenAddonsMgr("addons://detail/greedycache@Off.JustOff/preferences");
			} else {
				Services.prefs.getBranch(branch).setBoolPref("enabled", !enabled);
			}
		}
	};
};

var globalPrefsWatcher = {
	observe: function (subject, topic, data) {
		if (topic != "nsPref:changed") return;
		switch (data) {
			case "enabled":
			if (Services.prefs.getBranch(branch).getBoolPref("enabled")) {
				httpRequestObserver.register();
				enabled = true;
			} else {
				httpRequestObserver.unregister();
				enabled = false;
			}
			break;
			case "enforceic":
			if (Services.prefs.getBranch(branch).getBoolPref("enforceic")) {
				httpResponseObserver.register();
				enforce = true;
			} else {
				httpResponseObserver.unregister();
				enforce = false;
			}
			break;
			case "useExceptions":
				useExceptions = Services.prefs.getBranch(branch).getBoolPref("useExceptions");
			break;
			case "exceptionList":
				var exceptionList = Services.prefs.getBranch(branch).getComplexValue("exceptionList", Ci.nsISupportsString).data;
				if (exceptionList == "") {
					Services.prefs.getBranch(branch).clearUserPref("exceptionList");
				}
				domRegex = null;
			break;
			case "unhideToolbar":
				unhideToolbar = Services.prefs.getBranch(branch).getBoolPref("unhideToolbar");
			break;
		}
	},
	register: function () {
		var prefsService = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService);
		this.prefBranch = prefsService.getBranch(branch);
		this.prefBranch.addObserver("", this, false);
	},
	unregister: function () {
		this.prefBranch.removeObserver("", this);
	}
}

function BrowserWindowObserver(handlers) {
	this.handlers = handlers;
}

BrowserWindowObserver.prototype = {
	observe: function (aSubject, aTopic, aData) {
		if (aTopic == "domwindowopened") {
			aSubject.QueryInterface(Ci.nsIDOMWindow).addEventListener("load", this, false);
		} else if (aTopic == "domwindowclosed") {
			if (aSubject.document.documentElement.getAttribute("windowtype") == "navigator:browser") {
				this.handlers.onShutdown(aSubject);
			}
		}
	},
	handleEvent: function (aEvent) {
		let aWindow = aEvent.currentTarget;
		aWindow.removeEventListener(aEvent.type, this, false);

		if (aWindow.document.documentElement.getAttribute("windowtype") == "navigator:browser") {
			this.handlers.onStartup(aWindow);
		}
	}
};

function browserWindowStartup (aWindow) {
	aWindow.greedyCache = gcacheIn(aWindow);
	aWindow.greedyCache.init()
}

function browserWindowShutdown (aWindow) {
	aWindow.greedyCache.done();
	delete aWindow.greedyCache;
}

function startup(data, reason) {
	Cu.import("chrome://greedy-cache/content/prefloader.js");
	PrefLoader.loadDefaultPrefs(data.installPath, "greedy-cache.js");

	var p = Services.prefs.getBranch(branch);
	useExceptions = p.getBoolPref("useExceptions");
	listTest();
	enabled = p.getBoolPref("enabled");
	if (enabled) {
		httpRequestObserver.register();
	}
	enforce = p.getBoolPref("enforceic");
	if (enforce) {
		httpResponseObserver.register();
	}
	globalPrefsWatcher.register();
	unhideToolbar = p.getBoolPref("unhideToolbar");

	var ww = Cc["@mozilla.org/embedcomp/window-watcher;1"].getService(Ci.nsIWindowWatcher);
	gWindowListener = new BrowserWindowObserver({
		onStartup: browserWindowStartup,
		onShutdown: browserWindowShutdown
	});
	ww.registerNotification(gWindowListener);
	
	var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
	var winenu = wm.getEnumerator("navigator:browser");
	while (winenu.hasMoreElements()) {
		browserWindowStartup(winenu.getNext());
	}
}

function shutdown(data, reason) {

	if (reason == APP_SHUTDOWN) return;

	var ww = Cc["@mozilla.org/embedcomp/window-watcher;1"].getService(Ci.nsIWindowWatcher);
	ww.unregisterNotification(gWindowListener);
	gWindowListener = null;

	var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
	var winenu = wm.getEnumerator("navigator:browser");
	while (winenu.hasMoreElements()) {
		browserWindowShutdown(winenu.getNext());
	}

	globalPrefsWatcher.unregister();
	if (enforce) {
		httpResponseObserver.unregister();
	}
	if (enabled) {
		httpRequestObserver.unregister();
	}

	Cu.unload("chrome://greedy-cache/content/prefloader.js");
}

function install(data, reason) {}
function uninstall(data, reason) {}
