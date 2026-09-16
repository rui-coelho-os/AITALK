// Mock database
const db = {
  policies: {
    "POL-12345": { name: "John Doe", status: "Active", coverage: "Comprehensive Auto", claimLimit: 50000 },
    "POL-67890": { name: "Jane Smith", status: "Pending Verification", coverage: "Property Insurance", claimLimit: 120000 }
  },
  savedData: []
};

export const externalApi = {
  // Confirm user/policy details
  async getPolicyDetails(name, policyNumber) {
    console.log(`[EXTERNAL API] Fetching details for Name: ${name}, Policy: ${policyNumber}`);
    
    try {
      // Encode parameters to handle spaces and special characters safely
      const encodedName = encodeURIComponent(name);
      const encodedPolicyNumber = encodeURIComponent(policyNumber);
      
      const url = `https://psaiworkshop-dev.outsystems.app/AIVoiceAgentBackofficeNeoTank/rest/AIVoice/Policy_Get?Name=${encodedName}&PolicyNumber=${encodedPolicyNumber}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        return { 
          status: "error", 
          message: `API responded with status code ${response.status}` 
        };
      }

      const data = await response.json();
      return { status: "success", data };

    } catch (error) {
      console.error("[EXTERNAL API ERROR]:", error);
      return { 
        status: "error", 
        message: "Failed to reach external policy API service." 
      };
    }
  },

  // Save conversation transcripts or data points gathered during the call
  async storeConversationData(policyId, summaryData) {
    console.log(`[EXTERNAL API] Saving data for ${policyId}:`, summaryData);
    db.savedData.push({ policyId, ...summaryData, timestamp: new Date().toISOString() });
    return { status: "success", savedRecordId: db.savedData.length };
  }
};