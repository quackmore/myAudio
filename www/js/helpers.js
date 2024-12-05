const toutFetch = (url, ms, { signal, ...options } = {}) => {
    const controller = new AbortController();
    const promise = fetch(url, { signal: controller.signal, ...options })
        .then(
            response => {
                if (response.status === 200)
                    return response;
                else
                    return response.text()
                        .then(data => { throw new Error(response.status + ' ' + data) });
            },
            error => {
                if (error.name === "AbortError")
                    throw new Error("Request timeout");
                else
                    throw new Error("Device unreachable");
            }
        )
    if (signal) signal.addEventListener("abort", () => controller.abort());
    const timeout = setTimeout(() => controller.abort(), ms);
    return promise.finally(() => clearTimeout(timeout));
}

function userPrefs(_prefs) {
    var curPrefs = { ..._prefs };

    this.get = function (_key) {
        return curPrefs[_key];
    }

    this.set = function (_key, _value) {
        if (typeof (_value) === "bigint" ||
            typeof (_value) === "boolean" ||
            typeof (_value) === "number" ||
            typeof (_value) === "string")
            if (curPrefs[_key] === _value) return;
        curPrefs[_key] = _value;
        const req = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(curPrefs)
        };
        toutFetch('/clientPref', 30000, req);
    }

    this.print = function () {
        console.log(JSON.stringify(curPrefs));
    }
}

var mdlCnt = 0;
const loadSpinner = () => {
    mdlCnt++;
    if (mdlCnt == 1) {
        document.getElementById("spinnerMod").style.visibility = "visible";
        document.getElementById("spinnerMod").style.opacity = 1;
    }
}
const unloadSpinner = () => {
    mdlCnt--;
    if (mdlCnt == 0) {
        document.getElementById("spinnerMod").style.visibility = "hidden";
        document.getElementById("spinnerMod").style.opacity = 0;
    }
}

function secsToString(val) {
    let hh = Math.trunc(val / 3600);
    let mm = Math.trunc((val % 3600) / 60);
    let ss = Math.trunc((val % 3600) % 60);
    return `${hh > 0 ? hh + ":" : ""}${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function msWait(ms) {
    return new Promise((resolve, reject) => {
        btTimer = setTimeout(resolve, ms);
    });
}