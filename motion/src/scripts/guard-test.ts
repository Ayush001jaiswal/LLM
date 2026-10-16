import { checkRewrite, unsupportedTerms } from "../services/resume/improve.js";
import { formatDate, parseSkills, splitSections } from "../services/resume/parse.js";
import { extractKeywords } from "../services/resume/ats.js";

const src = "Backend Developer at Acme Pay\nDeveloped REST APIs for payment service using Node.js and PostgreSQL\nImproved API response time by 35% with database indexes";
const orig = ["Developed REST APIs for payment service using Node.js and PostgreSQL", "Improved API response time by 35% with database indexes"];
const cases: [string, string[], boolean][] = [
  ["good reword", ["Built REST APIs for the payment service using Node.js and PostgreSQL", "Cut API response time by 35% by adding database indexes"], true],
  ["invented number", ["Built REST APIs for the payment service using Node.js and PostgreSQL", "Cut API response time by 60% by adding database indexes"], false],
  ["invented tool", ["Built REST APIs on AWS using Node.js and PostgreSQL", "Cut API response time by 35% with database indexes"], false],
  ["invented tech (lowercase-start ok?)", ["Built REST APIs using Node.js, PostgreSQL and Kafka", "Cut API response time by 35% with database indexes"], false],
  ["extra bullet added", [...orig, "Led a team of 10"], false],
  ["empty", [], false],
  ["too long", ["Built " + "very ".repeat(40) + "fast APIs", "Cut API response time by 35% with database indexes"], false],
];
let bad = 0;
for (const [name, rewritten, expectOk] of cases) {
  const v = checkRewrite(rewritten, orig, src);
  const ok = v.ok === expectOk;
  if (!ok) bad++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${v.ok ? "accepted" : "rejected (" + v.reason + ")"}`);
}
console.log("unsupported in 'Led Payments team at Google':", unsupportedTerms("Led Payments team at Google", src.toLowerCase()));

console.log("\ndates:", ["03/2021", "March 2021", "Mar. 2021", "2021", "till date", "Ongoing", "Q3 2021"].map(formatDate));
console.log("skills:", JSON.stringify(parseSkills(["• Java, Python, SQL", "Cloud: AWS; GCP", "Git • Docker"])));
const s = splitSections("JOHN DOE\njohn@x.com\nEXPERIENCE\nSOFTWARE ENGINEER\nGOOGLE\nBuilt things\nEDUCATION\nBSc");
console.log("caps job title inside experience stays in experience:", s.parts.experience, "| header:", s.header);
console.log("keywords:", extractKeywords("We need a Backend Developer with Node.js, PostgreSQL and Kubernetes. Strong REST API experience; experience with Docker and APIs required."));
process.exit(bad ? 1 : 0);
