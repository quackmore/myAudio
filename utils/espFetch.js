const espFetch = (url, ms, { signal, ...options } = {}) => {
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

export default espFetch;
