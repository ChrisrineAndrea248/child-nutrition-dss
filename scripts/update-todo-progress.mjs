import fs from "node:fs";
const path = "todo.md";
let text = fs.readFileSync(path, "utf8");
text = text.replace("- [ ] Implement four-step New Prediction form with validation, loading state, ML-service-ready backend prediction procedure, persistence, and navigation", "- [x] Implement four-step New Prediction form with validation, loading state, ML-service-ready backend prediction procedure, persistence, and navigation");
text = text.replace("- [x] Add and run Vitest coverage for the available auth and prediction-risk logic; extend coverage after feature procedures are implemented", "- [x] Add and run Vitest coverage for auth, prediction-risk logic, prediction persistence, report metadata, and settings authorization contracts");
fs.writeFileSync(path, text);
