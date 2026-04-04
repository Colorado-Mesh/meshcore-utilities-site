document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById("repeater-form");
    const submitBtn = document.getElementById("submit-btn");
    const validationError = document.getElementById("validation-error");
    const citySelect = document.getElementById('city-select');
    const landmarkEntry = document.getElementById('landmark-entry');
    const mountainSelect = document.getElementById('mountain-select');
    const nodeTypeSelect = document.getElementById('node-type');
    const resultDiv = document.getElementById('result');

    // Location strategy elements
    const locationStrategyRadios = document.querySelectorAll('input[name="location_strategy"]');
    const locationCityStrategy = document.getElementById('location-city-strategy');
    const locationCityStrategyLandmark = document.getElementById('location-city-strategy-landmark');
    const locationMountainStrategy = document.getElementById('location-mountain-strategy');

    // Handle location strategy changes
    locationStrategyRadios.forEach(radio => {
        radio.addEventListener('change', function () {
            locationCityStrategy.style.display = 'none';
            locationCityStrategyLandmark.style.display = 'none';
            citySelect.value = '';
            landmarkEntry.value = '';
            locationMountainStrategy.style.display = 'none';
            mountainSelect.value = '';

            if (this.value === 'city') {
                locationCityStrategy.style.display = 'block';
                locationCityStrategyLandmark.style.display = 'block';
            } else if (this.value === 'mountain') {
                locationMountainStrategy.style.display = 'block';
            }

            validateForm();
        });
    });

    // Wire all code blocks to be click-to-copy
    document.querySelectorAll('.code-block code').forEach(code => {
        code.title = "Click to copy";
        code.role = "button";
        code.tabIndex = "0";
        code.addEventListener('click', function () {
            copyToClipboard(this.id).then(r => {
            });
        })
    })

    // Validate form on input changes
    function validateForm() {
        // Either need mountain or city+landmark filled out
        const cityProvided = citySelect.value.trim() !== '';
        const landmarkProvided = landmarkEntry.value.trim() !== '';
        const mountainProvided = mountainSelect.value.trim() !== '';
        const isLocationValid = (mountainProvided) || (cityProvided && landmarkProvided);

        const isNodeTypeValid = nodeTypeSelect.value !== '';

        // Update visual feedback
        citySelect.classList.toggle('invalid', !isLocationValid && !cityProvided);
        landmarkEntry.classList.toggle('invalid', !isLocationValid && !landmarkProvided);
        mountainSelect.classList.toggle('invalid', !isLocationValid && !mountainProvided);
        nodeTypeSelect.classList.toggle('invalid', !isNodeTypeValid);

        // Enable/disable submit button
        const isFormValid = isLocationValid && isNodeTypeValid;
        submitBtn.disabled = !isFormValid;

        return isFormValid;
    }

    // Add event listeners for real-time validation
    citySelect.addEventListener('change', validateForm);
    landmarkEntry.addEventListener('input', validateForm);
    mountainSelect.addEventListener('change', validateForm);
    nodeTypeSelect.addEventListener('change', validateForm);

    // Initial validation check
    validateForm();

    // Handle form submission
    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        // Validate before submission
        if (!validateForm()) {
            validationError.style.display = 'block';
            // Scroll to error message
            validationError.scrollIntoView({behavior: 'smooth', block: 'nearest'});
            return;
        }

        // Hide validation error if showing
        validationError.style.display = 'none';

        const formData = new FormData(form);
        const data = {};

        // Convert FormData to object, handling checkbox properly
        for (let [key, value] of formData.entries()) {
            data[key] = value;
        }

        // Show loading state
        submitBtn.disabled = true;
        submitBtn.textContent = 'Generating...';

        try {
            const res = await fetch(form.action, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(data),
            });

            if (res.ok) {
                const result = await res.json();
                // displayResult(result);
                displaySuccess(result);
            } else {
                throw new Error('Failed to generate configuration');
            }
        } catch (error) {
            displayError(error.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Generate Configuration';
        }
    });

    function scrollToElement(element) {
        element.scrollIntoView({behavior: 'smooth', block: 'nearest'});
    }

    function scrollToElementId(elementId) {
        let element = document.getElementById(elementId);
        scrollToElement(element);
    }

    function scrollToResults() {
        // Scroll to results div
        resultDiv.style.display = 'block';
        scrollToElement(resultDiv);
    }

    function clearError() {
        // Hide the resultsError (no need to clear the content)
        let resultsError = document.getElementById('results-error');
        resultsError.style.display = 'none';
    }

    function displayError(message) {
        // Populate the results-error div
        let resultsError = document.getElementById('results-error');
        let resultsErrorMessage = document.getElementById('result-error-message');

        resultsErrorMessage.innerText = message;

        resultsError.style.display = 'block';
        scrollToResults()
    }

    function clearSuccess() {
        // Hide the resultsSuccess (no need to clear the content)
        let resultsSuccess = document.getElementById('results-success');
        resultsSuccess.style.display = 'none';
    }

    function displaySuccess(data) {
        // Populate the results-success div
        let nodeName = data.name;
        let publicKeyId = data.public_key_id;
        let resultsSuccess = document.getElementById('results-success');
        let resultsNodeName = document.getElementById('result-node-name');
        let resultsNodeNameCopyBtn = document.getElementById('result-node-name-copy-btn');
        let resultsPublicKeyId = document.getElementById('result-public-key-id');
        let resultsPublicKeyIdCopyBtn = document.getElementById('result-public-key-id-copy-btn');
        let resultsPublicKey = document.getElementById('result-public-key');
        let resultsPublicKeyCopyBtn = document.getElementById('result-public-key-copy-btn');
        let resultsPrivateKey = document.getElementById('result-private-key');
        let resultsPrivateKeyCopyBtn = document.getElementById('result-private-key-copy-btn');
        let resultsGenerateKeysBtn = document.getElementById('result-generate-keys-btn');
        let resultsKeyUpdateExplainer = document.getElementById('result-key-update-explainer');
        let resultsSetPrivateKeyCommand = document.getElementById('result-set-private-key-command');
        let resultsActions = document.getElementById('result-actions');
        let resultsDownloadConfigBtn = document.getElementById('result-config-download-button');

        resultsKeyUpdateExplainer.style.display = 'none';
        resultsActions.style.display = 'none';

        resultsNodeName.textContent = nodeName;
        resultsNodeNameCopyBtn.addEventListener('click', () => copyButtonClicked(resultsNodeName.id));
        resultsPublicKeyId.textContent = publicKeyId;
        resultsPublicKeyIdCopyBtn.addEventListener('click', () => copyButtonClicked(resultsPublicKeyId.id));

        resultsPublicKey.value = '';
        resultsPrivateKey.value = '';
        resultsPublicKeyCopyBtn.addEventListener('click', () => copyButtonClicked(resultsPublicKey.id));
        resultsPrivateKeyCopyBtn.addEventListener('click', () => copyButtonClicked(resultsPrivateKey.id));

        const estimatedGenerationTimeText = getKeyPairGenerationTimeEstimate(publicKeyId);
        const btnContent = `Generate Public & Private Keys (~${estimatedGenerationTimeText})`;
        resultsGenerateKeysBtn.textContent = btnContent;
        resultsGenerateKeysBtn.addEventListener('click', async () => {
            try {
                resultsGenerateKeysBtn.disabled = true;
                resultsGenerateKeysBtn.textContent = 'Generating keys...';

                const generated = await generateKeyPair(publicKeyId);
                resultsPublicKey.value = generated.publicKey;
                resultsPrivateKey.value = generated.privateKey;
                resultsSetPrivateKeyCommand.textContent = `set prv.key ${generated.privateKey}`;
                resultsKeyUpdateExplainer.style.display = 'block';
                resultsActions.style.display = 'block';
                scrollToElement(resultsDownloadConfigBtn);
            } catch (error) {
                displayError(error.message || 'Failed to generate key pair');
            } finally {
                resultsGenerateKeysBtn.disabled = false;
                resultsGenerateKeysBtn.textContent = btnContent;
            }
        });
        resultsDownloadConfigBtn.addEventListener('click', () => {
            downloadJSON(data.import_json, data.import_json_file_name, resultsPublicKey.value, resultsPrivateKey.value);
        });

        resultsSuccess.style.display = 'block';
        scrollToResults()
    }

    function copyToClipboard(elementId) {
        const element = document.getElementById(elementId);
        const text = element.textContent;
        return navigator.clipboard.writeText(text);
    }

    function copyButtonClicked(elementId) {
        const element = document.getElementById(elementId);
        copyToClipboard(elementId).then(() => {
            const button = element.nextElementSibling;
            const originalText = button.textContent;
            button.textContent = 'Copied!';
            button.classList.add('copied');
            setTimeout(() => {
                button.textContent = originalText;
                button.classList.remove('copied');
            }, 2000);
        });
    }

    function showError(message) {
        alert(message); // Yes, this is janky
        // errorContainer.textContent = message;
        // errorContainer.style.display = 'block';
    }

    function getKeyPairGenerationTimeEstimate(prefix) {
        return keyGenerator.estimateTimeText(prefix.length);
    }

    async function generateKeyPair(prefix) {
        // Even though the ColoradoMesh Python library is capable of doing this,
        // we do this client-side rather than server-side to ensure zero knowledge of user secrets

        if (typeof keyGenerator === 'undefined') {
            showError('Key generator is not loaded.');
        }

        // Check if Web Crypto API is available
        if (typeof crypto === 'undefined' || typeof crypto.subtle === 'undefined') {
            showError('Web Crypto API is not available in this browser.');
        }

        // Sanitize input
        prefix = prefix.trim().toUpperCase();
        if (prefix.length === 0 || prefix.length > 8) {
            showError('Prefix must be between 1 and 8 characters long.');
        }
        if (!/^[0-9A-F]+$/.test(prefix)) {
            showError('Prefix must contain only hexadecimal characters (0-9, A-F).');
        }

        await keyGenerator.initialize();
        const result = await keyGenerator.generateVanityKey(prefix, []);
        if (!result) {
            showError('Key generation failed. Please refresh the page and try again.');
        }

        return {
            publicKey: result.publicKey,
            privateKey: result.privateKey
        };
    }

    function downloadJSON(importJson, fileName, publicKey, privateKey) {
        // Create a copy of import_json to avoid modifying the original
        const jsonData = JSON.parse(JSON.stringify(importJson));

        // Add private key if provided
        if (privateKey.trim()) {
            // Must match the format expected by the repeater configuration
            jsonData['prv.key'] = privateKey.trim();
        }

        const jsonString = JSON.stringify(jsonData, null, 2);
        const blob = new Blob([jsonString], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${fileName}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
});
