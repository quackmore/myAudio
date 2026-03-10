function readCfg(onError) {
    return toutFetch('/cfgFile', 5000)
        .then(data => data.json())
        .catch(err => {
            if (onError) onError(err)
        });
}

function saveCfg(cfg, onError) {
    req = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg)
    };
    return toutFetch('/cfgFile', 5000, req)
        .catch(err => {
            if (onError) onError(err)
        });
}