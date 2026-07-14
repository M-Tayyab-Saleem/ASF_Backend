const mongoose = require('mongoose');
const Tool = require('../models/Tool');
const Capability = require('../models/Capability');
const CapabilityToolMapping = require('../models/CapabilityToolMapping');
require('dotenv').config();

const mappingPlan = {
  "Microsoft Entra ID": ["Authentication & Access", "Federation & SSO", "MFA & Conditional Access", "Zero Trust Policy"],
  "Microsoft Purview": ["Data Classification & Labeling", "Sensitive Data Discovery", "Encryption Key Management", "Digital Rights Management", "Data Masking & Redaction", "Anonymization & Tokenization", "Data Retention & Archival", "eDiscovery & Legal Hold", "Threat Modeling", "Compliance Auditing", "Risk Assessment", "AI Compliance Reporting", "Access Certification", "Role-Based Access Control (RBAC)", "Policy Engine & Enforcement", "Data Governance & Cataloging", "Data Lineage & Provenance", "Data Quality & Integrity", "User Activity Monitoring"],
  "Wiz": ["Infrastructure as Code (IaC) Scanning", "Container & Image Scanning", "Vulnerability Management", "Configuration & Hardening", "Cloud Security Posture Management (CSPM)", "Secrets Management", "Attack Surface Management", "Asset Inventory & Discovery"],
  "Cyera": ["Sensitive Data Discovery", "Data Classification & Labeling", "Shadow AI Detection", "Data Governance & Cataloging"],
  "Portal26": ["AI System Monitoring", "API Security & Rate Limiting", "Prompt Injection Defense", "Model Evasion Protection", "Data Poisoning Defense", "Data Anomaly Detection", "Incident Response & Forensics", "Shadow AI Detection"],
  "GitHub Advanced Security": ["Static Application Security Testing (SAST)", "Dynamic Application Security Testing (DAST)", "Software Composition Analysis (SCA)", "Secrets Management", "CI/CD Pipeline Security"],
  "Azure OpenAI Content Safety": ["Model Evasion Protection", "Prompt Injection Defense"],
  "CrowdStrike": ["Vulnerability Management", "Data Anomaly Detection", "Threat Intelligence", "Incident Response & Forensics", "Behavioral Analytics", "Data Loss Prevention (DLP)"],
  "Okta": ["Authentication & Access", "Federation & SSO", "MFA & Conditional Access", "Role-Based Access Control (RBAC)", "Access Certification"],
  "HashiCorp Vault": ["Secrets Management", "Encryption Key Management"],
  "CyberArk": ["Privileged Access Management (PAM)", "Secrets Management"],
  "Splunk": ["Security Information & Event Management (SIEM)", "AI System Monitoring", "Log Management & Analytics", "Threat Intelligence", "Incident Response & Forensics", "User Activity Monitoring", "Behavioral Analytics"],
  "Netskope": ["Data Loss Prevention (DLP)", "Cloud Access Security Broker (CASB)", "Shadow AI Detection", "Zero Trust Policy"],
  "Datadog": ["AI System Monitoring", "Log Management & Analytics", "Infrastructure as Code (IaC) Scanning", "API Security & Rate Limiting"],
  "SonarQube": ["Static Application Security Testing (SAST)", "Software Composition Analysis (SCA)"]
};

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get all new tools
    const tools = await Tool.find();
    console.log(`Found ${tools.length} tools`);

    // Get all capabilities
    const capabilities = await Capability.find();
    console.log(`Found ${capabilities.length} capabilities`);

    // Create lookup maps
    const capabilityByName = {};
    capabilities.forEach(c => {
      capabilityByName[c.capabilityName.trim()] = c;
    });

    let count = 0;

    for (const tool of tools) {
      const toolName = tool.name || tool.toolName;
      const targetCapabilityNames = mappingPlan[toolName];
      if (!targetCapabilityNames) {
        console.log(`No mapping plan for tool: ${toolName}`);
        continue;
      }

      for (const targetName of targetCapabilityNames) {
        // Fuzzy match: check if targetName is substring of capabilityName or capabilityCategory
        const capability = capabilities.find(c => 
          (c.capabilityName && c.capabilityName.toLowerCase().includes(targetName.toLowerCase())) ||
          (c.capabilityCategory && c.capabilityCategory.toLowerCase().includes(targetName.toLowerCase())) ||
          (targetName.toLowerCase().includes(c.capabilityName?.toLowerCase())) ||
          (targetName.toLowerCase().includes(c.capabilityCategory?.toLowerCase()))
        );

        if (!capability) {
          console.log(`Warning: Capability matching "${targetName}" not found in DB`);
          continue;
        }

        const existing = await CapabilityToolMapping.findOne({
          toolId: tool._id,
          capabilityId: capability._id
        });

        if (!existing) {
          await CapabilityToolMapping.create({
            toolId: tool._id,
            capabilityId: capability._id,
            description: `Seeded mapping for ${toolName} -> ${capability.capabilityName}`,
            verified: true
          });

          if (!capability.linkedTools) capability.linkedTools = [];
          if (!capability.linkedTools.includes(tool._id)) {
            capability.linkedTools.push(tool._id);
            await capability.save();
          }
          count++;
          console.log(`Mapped ${toolName} to ${capability.capabilityName}`);
        }
      }
    }

    console.log(`Successfully created ${count} new capability-tool mappings.`);
    process.exit(0);
  } catch (error) {
    console.error('Seed Error:', error);
    process.exit(1);
  }
}

seed();
