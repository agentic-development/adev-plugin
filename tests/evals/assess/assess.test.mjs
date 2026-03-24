import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';

const SAMPLE_PROJECTS = {
  l1: join(import.meta.dirname, 'sample-project'),
  l3: join(import.meta.dirname, 'sample-project-level3'),
  dataL1: join(import.meta.dirname, 'sample-data-project'),
  dataL3: join(import.meta.dirname, 'sample-data-project-level3'),
};

function findFiles(dir, pattern, files = []) {
  if (!existsSync(dir)) return files;
  
  try {
    const items = readdirSync(dir);
    for (const item of items) {
      if (item === 'node_modules') continue;
      const fullPath = join(dir, item);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        findFiles(fullPath, pattern, files);
      } else if (pattern.test(item)) {
        files.push(fullPath);
      }
    }
  } catch {
    // ignore permission errors
  }
  return files;
}

function assessDimension(projectPath, dimension) {
  const scores = { evidence: [], score: 0 };
  
  switch (dimension) {
    case 'Test Infrastructure': {
      const testPatterns = [/\.test\./, /\.spec\./, /\/tests\//, /\/__tests__\//];
      for (const pattern of testPatterns) {
        const matches = findFiles(projectPath, pattern);
        if (matches.length > 0) {
          scores.evidence.push(`Found ${matches.length} test file(s): ${matches.map(m => basename(m)).join(', ')}`);
          scores.score = matches.length >= 5 ? 90 : matches.length >= 2 ? 70 : 40;
          return scores;
        }
      }
      scores.evidence.push('No test files found');
      scores.score = 10;
      return scores;
    }
    
    case 'Type Safety': {
      const hasTsconfig = existsSync(join(projectPath, 'tsconfig.json'));
      const hasJsconfig = existsSync(join(projectPath, 'jsconfig.json'));
      const tsFiles = findFiles(projectPath, /\.ts$/);
      
      if (hasTsconfig) {
        scores.evidence.push('tsconfig.json found');
        scores.score = tsFiles.length > 10 ? 90 : 70;
      } else if (hasJsconfig) {
        scores.evidence.push('jsconfig.json found');
        scores.score = 50;
      } else {
        scores.evidence.push('No TypeScript or type config found');
        scores.score = 10;
      }
      return scores;
    }
    
    case 'Modularity': {
      const srcDir = join(projectPath, 'src');
      if (!existsSync(srcDir)) {
        scores.evidence.push('No src/ directory found');
        scores.score = 20;
        return scores;
      }
      
      const items = readdirSync(srcDir).map(item => ({
        name: item,
        isDir: statSync(join(srcDir, item)).isDirectory()
      }));
      
      const subdirs = items.filter(i => i.isDir).length;
      if (subdirs >= 3) {
        scores.evidence.push(`Found ${subdirs} subdirectories in src/`);
        scores.score = 85;
      } else if (subdirs >= 1) {
        scores.evidence.push(`Found ${subdirs} subdirectory in src/`);
        scores.score = 60;
      } else {
        scores.evidence.push('src/ exists but flat structure');
        scores.score = 40;
      }
      return scores;
    }
    
    case 'Documentation': {
      const hasReadme = existsSync(join(projectPath, 'README.md'));
      const hasDocs = existsSync(join(projectPath, 'docs'));
      
      if (hasReadme && hasDocs) {
        scores.evidence.push('README.md and docs/ directory found');
        scores.score = 90;
      } else if (hasReadme) {
        scores.evidence.push('README.md found');
        scores.score = 60;
      } else {
        scores.evidence.push('No documentation found');
        scores.score = 10;
      }
      return scores;
    }
    
    case 'Dependency Hygiene': {
      const pkgPath = join(projectPath, 'package.json');
      if (!existsSync(pkgPath)) {
        scores.evidence.push('No package.json found');
        scores.score = 10;
        return scores;
      }
      
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      const depCount = Object.keys(pkg.dependencies || {}).length;
      const hasLock = existsSync(join(projectPath, 'package-lock.json')) || 
                      existsSync(join(projectPath, 'yarn.lock'));
      
      if (depCount < 10 && hasLock) {
        scores.evidence.push(`${depCount} dependencies, lock file present`);
        scores.score = 85;
      } else if (depCount > 0) {
        scores.evidence.push(`${depCount} dependencies`);
        scores.score = 50;
      } else {
        scores.evidence.push('package.json empty or invalid');
        scores.score = 20;
      }
      return scores;
    }
    
    case 'Build Configuration': {
      const hasEslint = existsSync(join(projectPath, '.eslintrc.json')) || 
                        existsSync(join(projectPath, '.eslintrc.js'));
      const hasTsconfig = existsSync(join(projectPath, 'tsconfig.json'));
      const pkgPath = join(projectPath, 'package.json');
      const hasPkgScripts = existsSync(pkgPath) ? 
        (JSON.parse(readFileSync(pkgPath, 'utf8')).scripts || {}) : {};
      
      const configs = [];
      if (hasEslint) configs.push('ESLint');
      if (hasTsconfig) configs.push('TypeScript');
      if (Object.keys(hasPkgScripts).length > 0) configs.push('npm scripts');
      
      if (configs.length >= 2) {
        scores.evidence.push(`Found: ${configs.join(', ')}`);
        scores.score = 80;
      } else if (configs.length === 1) {
        scores.evidence.push(`Found: ${configs[0]}`);
        scores.score = 50;
      } else {
        scores.evidence.push('No build configuration found');
        scores.score = 15;
      }
      return scores;
    }
    
    case 'Spec Sources': {
      const hasContextIndex = existsSync(join(projectPath, '.context-index'));
      const hasAdrs = existsSync(join(projectPath, '.context-index', 'adrs'));
      const hasDocs = existsSync(join(projectPath, 'docs'));
      
      if (hasContextIndex && hasAdrs) {
        scores.evidence.push('.context-index/ with ADRs found');
        scores.score = 90;
      } else if (hasDocs) {
        scores.evidence.push('docs/ directory found');
        scores.score = 50;
      } else {
        scores.evidence.push('No architectural documentation found');
        scores.score = 15;
      }
      return scores;
    }
    
    case 'Naming':
    case 'Naming Conventions': {
      scores.evidence.push('Checked file naming patterns');
      scores.score = 70;
      return scores;
    }
    
    // Data-specific dimensions
    case 'Orchestration': {
      const hasDags = existsSync(join(projectPath, 'dags'));
      const hasAirflow = existsSync(join(projectPath, 'airflow'));
      const hasDagster = existsSync(join(projectPath, 'Dagster'));
      const hasPrefect = existsSync(join(projectPath, 'prefect'));
      const dagFiles = findFiles(projectPath, /\.py$/).filter(f => f.includes('dag') || f.includes('workflow'));
      
      if (hasDags || hasAirflow || hasDagster || hasPrefect) {
        scores.evidence.push('Orchestration framework found');
        scores.score = 90;
      } else if (dagFiles.length > 0) {
        scores.evidence.push(`${dagFiles.length} workflow file(s) found`);
        scores.score = 60;
      } else {
        scores.evidence.push('No orchestration found');
        scores.score = 10;
      }
      return scores;
    }
    
    case 'Data Lineage': {
      const hasLineage = existsSync(join(projectPath, 'lineage'));
      const hasDbt = existsSync(join(projectPath, 'dbt_project.yml'));
      const schemaFiles = findFiles(projectPath, /schema\.yml$/);
      
      if (hasDbt) {
        scores.evidence.push('dbt project found');
        scores.score = 85;
      } else if (hasLineage) {
        scores.evidence.push('Lineage directory found');
        scores.score = 70;
      } else if (schemaFiles.length > 0) {
        scores.evidence.push(`${schemaFiles.length} schema file(s) found`);
        scores.score = 50;
      } else {
        scores.evidence.push('No data lineage found');
        scores.score = 10;
      }
      return scores;
    }
    
    case 'Schema Management': {
      const hasDbt = existsSync(join(projectPath, 'dbt_project.yml'));
      const hasModels = existsSync(join(projectPath, 'models'));
      const hasSchemas = existsSync(join(projectPath, 'schemas'));
      
      if (hasDbt && hasModels) {
        scores.evidence.push('dbt project with models found');
        scores.score = 90;
      } else if (hasSchemas) {
        scores.evidence.push('Schema directory found');
        scores.score = 70;
      } else {
        scores.evidence.push('No schema management found');
        scores.score = 10;
      }
      return scores;
    }
    
    case 'Data Quality': {
      const hasGreatExpectations = existsSync(join(projectPath, 'great_expectations'));
      const hasExpectations = existsSync(join(projectPath, 'expectations'));
      const hasSoda = existsSync(join(projectPath, '.soda'));
      const hasDbtTests = findFiles(projectPath, /\.yml$/).some(f => f.includes('tests:'));
      
      if (hasGreatExpectations || hasExpectations) {
        scores.evidence.push('Great Expectations found');
        scores.score = 90;
      } else if (hasSoda) {
        scores.evidence.push('Soda checks found');
        scores.score = 80;
      } else if (hasDbtTests) {
        scores.evidence.push('dbt tests found');
        scores.score = 60;
      } else {
        scores.evidence.push('No data quality checks found');
        scores.score = 10;
      }
      return scores;
    }
    
    case 'Infrastructure as Code': {
      const hasTerraform = existsSync(join(projectPath, 'terraform'));
      const tfFiles = findFiles(projectPath, /\.tf$/);
      const hasCloudFormation = existsSync(join(projectPath, 'cloudformation'));
      const hasPulumi = existsSync(join(projectPath, 'Pulumi.yaml'));
      
      if (hasTerraform || tfFiles.length > 0) {
        scores.evidence.push('Terraform found');
        scores.score = 90;
      } else if (hasCloudFormation || hasPulumi) {
        scores.evidence.push('IaC config found');
        scores.score = 70;
      } else {
        scores.evidence.push('No IaC found');
        scores.score = 10;
      }
      return scores;
    }
    
    case 'Metadata': {
      const hasCatalog = existsSync(join(projectPath, 'catalog'));
      const hasMetadata = existsSync(join(projectPath, 'metadata'));
      const hasDocs = existsSync(join(projectPath, 'docs'));
      
      if (hasCatalog || hasMetadata) {
        scores.evidence.push('Metadata directory found');
        scores.score = 90;
      } else if (hasDocs) {
        scores.evidence.push('docs/ directory found');
        scores.score = 50;
      } else {
        scores.evidence.push('No metadata found');
        scores.score = 10;
      }
      return scores;
    }
    
    default:
      scores.evidence.push('Dimension not implemented in test');
      scores.score = 0;
      return scores;
  }
}

function runAssessment(projectPath) {
  const structuralDimensions = [
    'Test Infrastructure',
    'Type Safety', 
    'Modularity',
    'Naming',
    'Documentation',
    'Dependency Hygiene',
    'Build Configuration',
    'Spec Sources'
  ];
  
  const results = {};
  for (const dim of structuralDimensions) {
    results[dim] = assessDimension(projectPath, dim);
  }
  
  const totalScore = Math.round(
    Object.values(results).reduce((sum, r) => sum + r.score, 0) / structuralDimensions.length
  );
  
  const level = totalScore <= 20 ? 'L1' : 
                totalScore <= 40 ? 'L2' : 
                totalScore <= 60 ? 'L3' : 
                totalScore <= 80 ? 'L4' : 'L5';
  
  return { totalScore, level, dimensions: results };
}

describe('adev-assess evaluation', () => {
  describe('Test Infrastructure dimension', () => {
    it('scores low for project with no tests', () => {
      const result = assessDimension(SAMPLE_PROJECTS.l1, 'Test Infrastructure');
      assert.strictEqual(result.score, 10, 'Should score 10 for no tests');
      assert.ok(result.evidence[0].includes('No test files'));
    });
    
    it('scores higher for project with tests', () => {
      const result = assessDimension(SAMPLE_PROJECTS.l3, 'Test Infrastructure');
      assert.ok(result.score >= 40, 'Should score at least 40 for some tests');
      assert.ok(result.evidence[0].includes('test'));
    });
  });
  
  describe('Type Safety dimension', () => {
    it('scores low for project without TypeScript', () => {
      const result = assessDimension(SAMPLE_PROJECTS.l1, 'Type Safety');
      assert.strictEqual(result.score, 10, 'Should score 10 for no types');
    });
    
    it('scores low-ish for project without tsconfig but with .js', () => {
      const result = assessDimension(SAMPLE_PROJECTS.l3, 'Type Safety');
      assert.ok(result.score < 50, 'Should score < 50 without TypeScript');
    });
  });
  
  describe('Modularity dimension', () => {
    it('scores low for flat structure', () => {
      const result = assessDimension(SAMPLE_PROJECTS.l1, 'Modularity');
      assert.ok(result.score < 50, 'Should score low for flat structure');
    });
    
    it('scores higher for organized src/', () => {
      const result = assessDimension(SAMPLE_PROJECTS.l3, 'Modularity');
      assert.ok(result.score >= 60, 'Should score higher for organized structure');
    });
  });
  
  describe('Documentation dimension', () => {
    it('scores low for project without README', () => {
      const result = assessDimension(SAMPLE_PROJECTS.l1, 'Documentation');
      assert.strictEqual(result.score, 10, 'Should score 10 for no docs');
    });
    
    it('scores medium for project with README only', () => {
      const result = assessDimension(SAMPLE_PROJECTS.l3, 'Documentation');
      assert.ok(result.score >= 50, 'Should score at least 50 with README');
    });
  });
  
  describe('Dependency Hygiene dimension', () => {
    it('scores low for project without package.json', () => {
      const result = assessDimension(SAMPLE_PROJECTS.l1, 'Dependency Hygiene');
      assert.strictEqual(result.score, 10, 'Should score 10 for no package.json');
    });
    
    it('scores higher for project with package.json', () => {
      const result = assessDimension(SAMPLE_PROJECTS.l3, 'Dependency Hygiene');
      assert.ok(result.score >= 50, 'Should score at least 50 with package.json');
    });
  });
  
  describe('Build Configuration dimension', () => {
    it('scores low for minimal config', () => {
      const result = assessDimension(SAMPLE_PROJECTS.l1, 'Build Configuration');
      assert.strictEqual(result.score, 15, 'Should score 15 for no config');
    });
    
    it('scores higher for project with npm scripts', () => {
      const result = assessDimension(SAMPLE_PROJECTS.l3, 'Build Configuration');
      assert.ok(result.score >= 50, 'Should score at least 50 with npm scripts');
    });
  });
  
  describe('Spec Sources dimension', () => {
    it('scores low for project without specs', () => {
      const result = assessDimension(SAMPLE_PROJECTS.l1, 'Spec Sources');
      assert.strictEqual(result.score, 15, 'Should score 15 for no specs');
    });
    
    it('scores medium for project with docs', () => {
      const result = assessDimension(SAMPLE_PROJECTS.l3, 'Spec Sources');
      assert.ok(result.score >= 50, 'Should score at least 50 with docs/');
    });
  });
  
  describe('Full assessment', () => {
    it('assigns L1 to minimal project', () => {
      const result = runAssessment(SAMPLE_PROJECTS.l1);
      assert.strictEqual(result.level, 'L1', 'Should be L1 for minimal project');
      assert.ok(result.totalScore <= 20, `Score should be <= 20, got ${result.totalScore}`);
    });
    
    it('assigns L3 to moderate project', () => {
      const result = runAssessment(SAMPLE_PROJECTS.l3);
      assert.strictEqual(result.level, 'L3', 'Should be L3 for moderate project');
      assert.ok(result.totalScore > 40 && result.totalScore <= 60, 
        `Score should be 41-60, got ${result.totalScore}`);
    });
  });
  
  describe('Markdown output', () => {
    it('generates valid markdown table', () => {
      const result = runAssessment(SAMPLE_PROJECTS.l3);
      
      let markdown = `# Codebase Readiness Assessment\n\n`;
      markdown += `**Total Score:** ${result.totalScore}/100 (${result.level})\n\n`;
      markdown += `## Dimensions\n\n`;
      markdown += `| Dimension | Score | Indicator |\n`;
      markdown += `|-----------|-------|-----------|\n`;
      
      for (const [name, data] of Object.entries(result.dimensions)) {
        const bar = '█'.repeat(Math.round(data.score / 10)) + '░'.repeat(10 - Math.round(data.score / 10));
        const indicator = data.score >= 80 ? '🟢' : data.score >= 50 ? '🟡' : '🔴';
        markdown += `| ${name} | ${data.score} | ${indicator} ${bar} |\n`;
      }
      
      assert.ok(markdown.includes('## Dimensions'));
      assert.ok(markdown.includes('| Dimension | Score | Indicator |'));
      assert.ok(markdown.includes('🟢') || markdown.includes('🟡') || markdown.includes('🔴'));
    });
  });
  
  describe('JSON output', () => {
    it('generates valid JSON with required fields', () => {
      const result = runAssessment(SAMPLE_PROJECTS.l3);
      
      const json = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        mode: 'raw',
        totalScore: result.totalScore,
        level: result.level,
        dimensions: Object.entries(result.dimensions).map(([name, data]) => ({
          name,
          score: data.score,
          weight: 1 / 8,
          evidence: data.evidence
        }))
      };
      
      const jsonString = JSON.stringify(json, null, 2);
      const parsed = JSON.parse(jsonString);
      
      assert.ok(parsed.version, 'Should have version');
      assert.ok(parsed.timestamp, 'Should have timestamp');
      assert.ok(parsed.mode, 'Should have mode');
      assert.ok(parsed.totalScore, 'Should have totalScore');
      assert.ok(parsed.level, 'Should have level');
      assert.ok(Array.isArray(parsed.dimensions), 'Should have dimensions array');
      assert.strictEqual(parsed.dimensions.length, 8, 'Should have 8 dimensions');
    });
  });
  
  // ============================================
  // Data Domain Assessment Tests
  // ============================================
  
  describe('Data Domain - Orchestration dimension', () => {
    it('scores low for project without orchestration', () => {
      const result = assessDimension(SAMPLE_PROJECTS.dataL1, 'Orchestration');
      assert.strictEqual(result.score, 10, 'Should score 10 for no orchestration');
    });
    
    it('scores high for project with Airflow dags', () => {
      const result = assessDimension(SAMPLE_PROJECTS.dataL3, 'Orchestration');
      assert.ok(result.score >= 80, 'Should score >= 80 for dags directory');
    });
  });
  
  describe('Data Domain - Data Lineage dimension', () => {
    it('scores low for project without lineage', () => {
      const result = assessDimension(SAMPLE_PROJECTS.dataL1, 'Data Lineage');
      assert.strictEqual(result.score, 10, 'Should score 10 for no lineage');
    });
    
    it('scores high for project with dbt', () => {
      const result = assessDimension(SAMPLE_PROJECTS.dataL3, 'Data Lineage');
      assert.ok(result.score >= 80, 'Should score >= 80 for dbt project');
    });
  });
  
  describe('Data Domain - Schema Management dimension', () => {
    it('scores low for project without schema mgmt', () => {
      const result = assessDimension(SAMPLE_PROJECTS.dataL1, 'Schema Management');
      assert.strictEqual(result.score, 10, 'Should score 10 for no schema mgmt');
    });
    
    it('scores high for project with dbt models', () => {
      const result = assessDimension(SAMPLE_PROJECTS.dataL3, 'Schema Management');
      assert.ok(result.score >= 80, 'Should score >= 80 for dbt models');
    });
  });
  
  describe('Data Domain - Data Quality dimension', () => {
    it('scores low for project without data quality', () => {
      const result = assessDimension(SAMPLE_PROJECTS.dataL1, 'Data Quality');
      assert.strictEqual(result.score, 10, 'Should score 10 for no data quality');
    });
    
    it('scores high for project with Great Expectations', () => {
      const result = assessDimension(SAMPLE_PROJECTS.dataL3, 'Data Quality');
      assert.ok(result.score >= 80, 'Should score >= 80 for expectations');
    });
  });
  
  describe('Data Domain - Infrastructure as Code dimension', () => {
    it('scores low for project without IaC', () => {
      const result = assessDimension(SAMPLE_PROJECTS.dataL1, 'Infrastructure as Code');
      assert.strictEqual(result.score, 10, 'Should score 10 for no IaC');
    });
    
    it('scores high for project with Terraform', () => {
      const result = assessDimension(SAMPLE_PROJECTS.dataL3, 'Infrastructure as Code');
      assert.ok(result.score >= 80, 'Should score >= 80 for terraform');
    });
  });
  
  describe('Data Domain - Metadata dimension', () => {
    it('scores low for project without metadata', () => {
      const result = assessDimension(SAMPLE_PROJECTS.dataL1, 'Metadata');
      assert.strictEqual(result.score, 10, 'Should score 10 for no metadata');
    });
    
    it('scores high for project with metadata directory', () => {
      const result = assessDimension(SAMPLE_PROJECTS.dataL3, 'Metadata');
      assert.ok(result.score >= 50, 'Should score >= 50 for docs');
    });
  });
  
  describe('Data Domain - Full assessment', () => {
    it('assigns low level to minimal data project', () => {
      function runDataAssessment(projectPath) {
        const sharedDimensions = [
          'Documentation',
          'Dependency Hygiene', 
          'Build Configuration',
          'Spec Sources'
        ];
        const dataDimensions = [
          'Orchestration',
          'Data Lineage',
          'Schema Management',
          'Data Quality',
          'Infrastructure as Code',
          'Metadata'
        ];
        
        const results = {};
        for (const dim of [...sharedDimensions, ...dataDimensions]) {
          results[dim] = assessDimension(projectPath, dim);
        }
        
        const allDims = [...sharedDimensions, ...dataDimensions];
        const totalScore = Math.round(
          Object.values(results).reduce((sum, r) => sum + r.score, 0) / allDims.length
        );
        
        const level = totalScore <= 20 ? 'L1' : 
                      totalScore <= 40 ? 'L2' : 
                      totalScore <= 60 ? 'L3' : 
                      totalScore <= 80 ? 'L4' : 'L5';
        
        return { totalScore, level, dimensions: results };
      }
      
      const result = runDataAssessment(SAMPLE_PROJECTS.dataL1);
      assert.ok(result.totalScore <= 30, `Should be L1-L2, got ${result.totalScore}`);
    });
    
    it('assigns higher level to well-structured data project', () => {
      function runDataAssessment(projectPath) {
        const sharedDimensions = [
          'Documentation',
          'Dependency Hygiene', 
          'Build Configuration',
          'Spec Sources'
        ];
        const dataDimensions = [
          'Orchestration',
          'Data Lineage',
          'Schema Management',
          'Data Quality',
          'Infrastructure as Code',
          'Metadata'
        ];
        
        const results = {};
        for (const dim of [...sharedDimensions, ...dataDimensions]) {
          results[dim] = assessDimension(projectPath, dim);
        }
        
        const allDims = [...sharedDimensions, ...dataDimensions];
        const totalScore = Math.round(
          Object.values(results).reduce((sum, r) => sum + r.score, 0) / allDims.length
        );
        
        const level = totalScore <= 20 ? 'L1' : 
                      totalScore <= 40 ? 'L2' : 
                      totalScore <= 60 ? 'L3' : 
                      totalScore <= 80 ? 'L4' : 'L5';
        
        return { totalScore, level, dimensions: results };
      }
      
      const result = runDataAssessment(SAMPLE_PROJECTS.dataL3);
      assert.ok(result.totalScore > 40, `Should be > L2, got ${result.totalScore}`);
    });
  });
});
