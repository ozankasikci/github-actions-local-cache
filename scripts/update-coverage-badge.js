#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read the coverage summary
const coveragePath = path.join(__dirname, '../coverage/coverage-summary.json');
const readmePath = path.join(__dirname, '../README.md');

if (!fs.existsSync(coveragePath)) {
  console.log('Coverage summary not found. Run tests first.');
  process.exit(1);
}

const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
const totalCoverage = Math.round(coverage.total.statements.pct);

// Determine badge color based on coverage percentage
let color = 'red';
if (totalCoverage >= 80) color = 'brightgreen';
else if (totalCoverage >= 60) color = 'yellow';
else if (totalCoverage >= 40) color = 'orange';

// Read README
let readme = fs.readFileSync(readmePath, 'utf8');

// Update coverage badge
const badgeRegex = /!\[Coverage\]\(https:\/\/img\.shields\.io\/badge\/coverage-\d+%25-\w+\.svg\)/;
const newBadge = `![Coverage](https://img.shields.io/badge/coverage-${totalCoverage}%25-${color}.svg)`;

if (badgeRegex.test(readme)) {
  readme = readme.replace(badgeRegex, newBadge);
} else {
  console.log('Coverage badge not found in README.md');
  process.exit(1);
}

// Write updated README
fs.writeFileSync(readmePath, readme);

console.log(`Updated coverage badge to ${totalCoverage}% (${color})`);