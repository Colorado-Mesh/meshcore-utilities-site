// Modal functions for hex grid
function _buildInfoCard(node) {
    const reservedWarning = node.is_reserved_id
        ? `<p class="hex-reserved-warning">⚠ Reserved ID in use</p>`
        : '';

    return `
        <div class="hex-info-card">
            <div class="hex-info-header">
                <span class="hex-id-badge hex-used-badge">${node.id}</span>
                <span class="hex-state-badge hex-state-${node.status}">${node.status_value}</span>
            </div>
            ${reservedWarning}
            <h2 class="hex-info-title">${node.name}</h2>
            <div class="hex-info-grid">
                <div class="hex-info-item">
                    <span class="hex-info-label">🏷️ Type</span>
                    <span class="hex-info-value">${node.node_type}</span>
                </div>
                <div class="hex-info-item">
                    <span class="hex-info-label">🔑 Public Key</span>
                    <span class="hex-info-value">${node.public_key}</span>
                </div>
                <div class="hex-info-item">
                    <span class="hex-info-label">📍 Location</span>
                    <span class="hex-info-value">${node.location}</span>
                </div>
                <div class="hex-info-item">
                    <span class="hex-info-label">🕐 Last Heard</span>
                    <span class="hex-info-value">${node.last_heard}</span>
                </div>
            </div>
            <div class="hex-info-contact">
                <a href="${node.contact_url}" class="hex-contact-btn">Add Contact</a>
            </div>
        </div>
    `
}

function _buildAvailableCard(hexId) {
    const repeaterUrl = new URL(REPEATER_TOOL_URL, window.location.origin);
    repeaterUrl.searchParams.set('id', hexId);

    return `
        <div class="hex-info-card">
            <div class="hex-info-header">
                <span class="hex-id-badge hex-free-badge">${hexId}</span>
                <span class="hex-state-badge hex-state-available">Available</span>
            </div>
            <h2 class="hex-info-title">This ID is available!</h2>
            <p class="hex-info-description">No node is currently using this ID. You can assign it to a new repeater.</p>
            <div class="hex-info-contact">
                <a href="${repeaterUrl.toString()}" class="hex-contact-btn">Add New Repeater</a>
            </div>
        </div>
    `
}

function showAvailableInfo(hexId) {
    const modal = document.getElementById('hex-modal');
    const modalBody = document.getElementById('hex-modal-body');

    modalBody.innerHTML = _buildAvailableCard(hexId);
    modal.style.display = 'block';
    modal.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showNodeInfo(hexId, node) {
    const modal = document.getElementById('hex-modal');
    const modalBody = document.getElementById('hex-modal-body');

    modalBody.innerHTML = _buildInfoCard(node);
    modal.style.display = 'block';
    modal.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showDuplicateInfo(hexId, nodes, isRepeaterCollision) {
    const modal = document.getElementById('hex-modal');
    const modalBody = document.getElementById('hex-modal-body');

    let entriesHtml = '';
    nodes.forEach((node, idx) => {
        entriesHtml += _buildInfoCard(node);
    });

    const warningSection = isRepeaterCollision ? `
        <div class="hex-info-header">
            <span class="hex-id-badge hex-duplicate-badge">${hexId}</span>
            <span class="hex-warning-badge">⚠️ REPEATER CONFLICT</span>
        </div>
        <p class="hex-duplicate-warning">Multiple repeaters are using the same ID. This must be resolved!</p>
    ` : `
        <div class="hex-info-header">
            <span class="hex-id-badge hex-duplicate-badge">${hexId}</span>
        </div>
        <p class="hex-info-description">Multiple nodes share this ID (mix of node types).</p>
    `;

    modalBody.innerHTML = `
        <div class="hex-info-card">
            ${warningSection}
            <div class="hex-duplicates-container">
                ${entriesHtml}
            </div>
        </div>
    `;

    modal.style.display = 'block';
    modal.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

let currentPrefix = null;
let activeSearchQuery = '';
let searchInput = null;
let searchClear = null;
let searchResults = null;
let primaryTable = null;
let subgridTable = null;

function _getCellSearchInfos(cell) {
    return Array.isArray(cell.search_infos) ? cell.search_infos : [];
}

function _getCellSearchText(cell) {
    return typeof cell.search_text === 'string' ? cell.search_text : '';
}

function _searchInInfo(info, query) {
    const searchableFields = [
        info.id,
        info.name,
        info.location,
        info.status,
        info.status_value,
        info.public_key,
        info.contact_url,
        info.last_heard,
        info.node_type,
    ];
    return searchableFields.some(field => field !== undefined && field !== null && String(field).toLowerCase().includes(query));
}

function _normalizeQuery(query) {
    return String(query || '').trim().toLowerCase();
}

function _setSearchClearVisible(isVisible) {
    if (searchClear) searchClear.style.display = isVisible ? 'block' : 'none';
}

function _clearHighlights() {
    if (primaryTable) {
        primaryTable.querySelectorAll('td').forEach(cell => {
            cell.classList.remove('hex-highlighted', 'hex-dimmed');
        });
    }

    if (subgridTable) {
        subgridTable.querySelectorAll('td').forEach(cell => {
            cell.classList.remove('hex-highlighted', 'hex-dimmed');
        });
    }
}

function clearSearch() {
    _clearHighlights();
    if (searchResults) searchResults.textContent = '';
}

function _cellMatchesQuery(cell, normalizedQuery) {
    const infos = _getCellSearchInfos(cell);
    if (!infos.length) return false;
    if (!_getCellSearchText(cell).includes(normalizedQuery)) return false;
    return infos.some(info => _searchInInfo(info, normalizedQuery));
}

function _collectSearchMatches(normalizedQuery) {
    const matchedPrefixes = new Set();
    const matchedIds = new Set();
    let matchCount = 0;
    let totalSearchable = 0;

    for (const r of HEX_CHARS) {
        for (const c of HEX_CHARS) {
            const prefix = `${r}${c}`;
            const sub = MATRIX_DATA[r].cells[c].sub_matrix;

            for (const r2 of HEX_CHARS) {
                for (const c2 of HEX_CHARS) {
                    const cell = sub[r2].cells[c2];
                    const infos = _getCellSearchInfos(cell);
                    if (!infos.length) continue;

                    totalSearchable += infos.length;

                    const matchingInfos = infos.filter(info => _searchInInfo(info, normalizedQuery));
                    if (!matchingInfos.length) continue;

                    matchedPrefixes.add(prefix);
                    matchedIds.add(cell.id);
                    matchCount += matchingInfos.length;
                }
            }
        }
    }

    return { matchedPrefixes, matchedIds, matchCount, totalSearchable };
}

function _renderSubGrid(prefix2, normalizedQuery = '') {
    const rowChar = prefix2[0];
    const colChar = prefix2[1];
    const subMatrix = MATRIX_DATA[rowChar].cells[colChar].sub_matrix;

    let html = '<tbody><tr><th></th>';
    for (const c of HEX_CHARS) html += `<th>${c}</th>`;
    html += '</tr>';

    for (const rowC of HEX_CHARS) {
        html += `<tr><th>${rowC}</th>`;
        const rowCells = subMatrix[rowC].cells;

        for (const colC of HEX_CHARS) {
            const cell = rowCells[colC];
            const escaped = cell.onclick_js_action.replace(/"/g, '&quot;');
            const searchClass = normalizedQuery
                ? (_cellMatchesQuery(cell, normalizedQuery) ? ' hex-highlighted' : ' hex-dimmed')
                : '';

            html += `<td class="${cell.css_class}${searchClass}" data-id="${cell.id}" onclick="${escaped}"><span class="hex-clickable">${cell.id}</span></td>`;
        }

        html += '</tr>';
    }

    html += '</tbody>';
    return html;
}

function performSearch(query) {
    const normalizedQuery = _normalizeQuery(query);
    activeSearchQuery = normalizedQuery;

    if (!normalizedQuery) {
        clearSearch();
        return;
    }

    const { matchedPrefixes, matchCount, totalSearchable } = _collectSearchMatches(normalizedQuery);

    _clearHighlights();

    if (currentPrefix) {
        subgridTable.innerHTML = _renderSubGrid(currentPrefix, normalizedQuery);
    } else {
        primaryTable.querySelectorAll('td[data-prefix]').forEach(cell => {
            const isMatch = matchedPrefixes.has(cell.dataset.prefix);
            cell.classList.toggle('hex-highlighted', isMatch);
            cell.classList.toggle('hex-dimmed', !isMatch);
        });
    }

    if (!searchResults) return;

    if (matchCount > 0) {
        searchResults.textContent = `Found ${matchCount} matching nodes${matchCount !== 1 ? 's' : ''} out of ${totalSearchable}`;
        searchResults.style.color = '#a8d68c';
    } else {
        searchResults.textContent = `No matches found for "${normalizedQuery}"`;
        searchResults.style.color = '#ff9999';
    }
}

function openSubGrid(prefix2) {
    currentPrefix = prefix2;

    subgridTable.innerHTML = _renderSubGrid(prefix2, activeSearchQuery);
    primaryTable.style.display = 'none';
    subgridTable.style.display = 'table';
    document.getElementById('hex-back-button').classList.remove('is-hidden');
    document.getElementById('hex-grid-title').textContent = `4-char IDs in ${prefix2}__`;
}

function backToPrimaryGrid() {
    currentPrefix = null;

    primaryTable.style.display = 'table';
    subgridTable.style.display = 'none';
    document.getElementById('hex-back-button').classList.add('is-hidden');
    document.getElementById('hex-grid-title').textContent = '2-char prefix grid';

    _applySearchState();
}

document.addEventListener('DOMContentLoaded', function() {
    searchInput = document.getElementById('hex-search');
    searchClear = document.getElementById('hex-search-clear');
    searchResults = document.getElementById('hex-search-results');
    primaryTable = document.getElementById('node-hex-grid');
    subgridTable = document.getElementById('subgrid-hex-grid');

    if (!searchInput || !searchClear || !searchResults || !primaryTable || !subgridTable) return;

    searchInput.addEventListener('input', function() {
        const query = _normalizeQuery(this.value);
        _setSearchClearVisible(query.length > 0);
        performSearch(query);
    });

    searchClear.addEventListener('click', function() {
        searchInput.value = '';
        activeSearchQuery = '';
        _setSearchClearVisible(false);
        clearSearch();
        searchInput.focus();
    });
});
