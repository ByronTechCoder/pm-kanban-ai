const result = document.getElementById("api-result");

fetch("/api/hello")
  .then((response) => response.json())
  .then((data) => {
    result.textContent = data.message;
  })
  .catch(() => {
    result.textContent = "Unable to reach the API.";
  });
