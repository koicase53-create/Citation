// --- START OF FILE script.js (CORRECTED) ---

document.addEventListener('DOMContentLoaded', () => {
    // --- 变量声明 ---
    let currentAuthor = null;
    let currentArticle = null;
    let currentAuthorCandidates = [];
    let authorWorksCache = [];
    let displayedWorksCache = [];
    let articleCandidatesCache = [];
    let citingArticlesCache = [];
    let journalCitationsCache = []; // ✅ 新增：缓存期刊互引结果
    let heatmapDataCache = null; // ✅ 新增：缓存热力图数据
    let currentChart = null; // For Chart.js instance
    let currentSankeyChart = null; // For ECharts Sankey instance
    let currentChordChart = null; // For ECharts Chord/Graph/Heatmap instance
    let currentBubbleChart = null; // NEW: Author impact scatter chart
    let currentCitingBarChart = null; // NEW: Author citing year-distribution bar
    let currentJournalRankingChart = null; // NEW: Journal ranking horizontal bar
    let currentDonutChart = null; // NEW: Article citation category donut
    let currentNetworkChart = null; // NEW: Author relationship force graph
    let networkHiddenCategories = new Set(); // NEW: hidden categories in author network chart

    // --- Element Selectors ---
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanes = document.querySelectorAll('.tab-pane');

    // 功能 1: 查作者信息
    const authorInfoPane = document.getElementById('author-info-pane');
    const authorStage1 = authorInfoPane.querySelector('#author-stage-1');
    const authorStage2 = authorInfoPane.querySelector('#author-stage-2');
    const authorStage3 = authorInfoPane.querySelector('#author-stage-3');
    const findAuthorBtn = authorInfoPane.querySelector('#find-author-btn');
    const authorCandidatesContainer = authorInfoPane.querySelector('#author-candidates-container');
    const backToAuthorSearchFromCandidatesBtn = authorInfoPane.querySelector('#back-to-author-search-from-candidates');
    const backToAuthorSearchBtn = authorInfoPane.querySelector('#back-to-author-search');
    const authorWorksContainer = authorInfoPane.querySelector('#author-works-container');
    const authorCitationStatsContainer = authorInfoPane.querySelector('#author-citation-stats-container');
    const workFilterInput = document.getElementById('work-filter-input');
    const workSortSelect = document.getElementById('work-sort-select');

    // 功能 2: 查作者引用
    const searchAuthorCitingBtn = document.getElementById('search-author-citing-btn');
    const authorCitingResultsWrapper = document.getElementById('author-citing-results-wrapper');
    const authorCitingChartContainer = document.getElementById('author-citing-chart');
    const authorCitingResultsContainer = document.getElementById('author-citing-results-container');

    // 功能 3: 查作者关系
    const searchAuthorNetworkBtn = document.getElementById('search-author-network-btn');
    const authorNetworkResultsWrapper = document.getElementById('author-network-results-wrapper');
    const authorNetworkStats = document.getElementById('author-network-stats');

    // 功能 4: 查期刊互引
    const searchJournalCitationsBtn = document.getElementById('search-journal-citations-btn');
    const journalCitationsResultsWrapper = document.getElementById('journal-citations-results-wrapper');
    const journalCitationsChartContainer = document.getElementById('journal-citations-chart');
    const journalCitationsResultsContainer = document.getElementById('journal-citations-results-container');
    const exportHeatmapBtn = document.getElementById('export-heatmap-btn');

    // 功能 4: 查文章被引
    const citedByPane = document.getElementById('cited-by-pane');
    const citedByStage1 = citedByPane.querySelector('#cited-by-stage-1');
    const citedByStage2 = citedByPane.querySelector('#cited-by-stage-2');
    const findArticleBtn = citedByPane.querySelector('#find-article-btn');
    const citedByArticleCandidatesContainer = citedByPane.querySelector('#cited-by-article-candidates-container');
    const backToArticleSearchBtn = citedByPane.querySelector('#back-to-article-search');

    // Modals
    const articleModal = document.getElementById('article-modal');
    const articleModalBody = document.getElementById('modal-body-content');
    const articleModalCloseBtn = articleModal.querySelector('.modal-close-btn');
    const citingModal = document.getElementById('citing-articles-modal');
    const citingModalTitle = document.getElementById('citing-modal-title');
    const citingModalList = document.getElementById('citing-articles-list');
    const citingModalCloseBtn = citingModal.querySelector('.modal-close-btn');

    let JOURNAL_CATEGORIES = {};
    const QUICK_FILL_CATEGORY_MAP = {
        'all': ['CSSCI 来源期刊(C刊)', 'CSSCI 扩展版来源期刊(C扩)', 'CSSCI 集刊'],
        'C刊': ['CSSCI 来源期刊(C刊)'],
        'C扩': ['CSSCI 扩展版来源期刊(C扩)'],
        '集刊': ['CSSCI 集刊']
    };
    const ORDERED_JOURNAL_CATEGORY_LABELS = QUICK_FILL_CATEGORY_MAP.all;


    // --- Core Functions ---
    async function fetchAPI(endpoint, body) {
        try {
            const response = await fetch(`/api${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const contentType = response.headers.get("content-type");

            if (!response.ok) {
                let errorMessage = `服务器错误: ${response.status}`;
                if (contentType && contentType.includes("application/json")) {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                } else {
                    errorMessage = `网络请求失败: ${response.status} ${response.statusText}`;
                }
                throw new Error(errorMessage);
            }

            if (contentType && contentType.includes("application/json")) {
                return response.json();
            }
            return response.blob();
        } catch (error) {
            console.error('API Fetch Error:', error);
            showError(error.message);
            return null;
        }
    }

    function setLoading(button, isLoading) {
        if (!button) return;
        if (isLoading) {
            button.classList.add('loading');
            button.disabled = true;
        } else {
            button.classList.remove('loading');
            button.disabled = false;
        }
    }

    async function handleApiButtonClick(button, apiCall) {
        if (button.classList.contains('loading')) return;
        setLoading(button, true);
        try {
            await apiCall();
        } catch (error) {
            console.error("API call failed:", error);
        } finally {
            setLoading(button, false);
        }
    }

    // --- Event Listeners ---
    document.addEventListener('click', async (e) => {
        const statLink = e.target.closest('.stat-value-link');
        const articleItem = e.target.closest('.citing-article-item');
        const exportBtn = e.target.closest('.btn-export');
        const chartDownloadBtn = e.target.closest('#download-chart-btn');
        const exportHeatmapBtnClick = e.target.closest('#export-heatmap-btn');

        if (statLink) {
            e.preventDefault();
            const { targetId, targetType, citationType, citationLabel } = statLink.dataset;
            const statsCard = statLink.closest('.citation-stats-card');
            if (!statsCard) return;
            const startYear = statsCard.querySelector('#citation-start-year').value;
            const endYear = statsCard.querySelector('#citation-end-year').value;
            citingModalTitle.textContent = `${citationLabel}引用列表 (${startYear}-${endYear})`;
            showLoading(citingModalList);
            citingModal.style.display = 'flex';
            const data = await fetchAPI('/get-citing-articles', { target_id: targetId, target_type: targetType, citation_type: citationType, start_year: startYear, end_year: endYear });
            if (data?.articles) renderCitingArticles(data.articles);
        } else if (articleItem) {
            const articleId = articleItem.dataset.articleId;
            if (!articleId) return;
            showLoading(articleModalBody);
            if (citingModal.style.display !== 'none') citingModal.style.display = 'none';
            articleModal.style.display = 'flex';
            const defaultStartYear = new Date().getFullYear() - 10;
            const defaultEndYear = new Date().getFullYear();
            const analysisData = await fetchAPI('/analyze-article-citations', { article_id: articleId, start_year: defaultStartYear, end_year: defaultEndYear });
            if (analysisData?.success) {
                currentArticle = analysisData.details;
                showArticleModalWithAnalysis(analysisData);
            } else {
                showError("无法加载该文章的详情。", articleModalBody);
            }
        } else if (exportBtn) {
            e.preventDefault();
            const targetId = exportBtn.dataset.target;
            const filenamePrefix = exportBtn.dataset.filenamePrefix || 'export';
            const container = document.getElementById(targetId);
            if (!container) return;

            let dataToExport;

            if (targetId === 'author-works-container') {
                dataToExport = displayedWorksCache;
            } else if (targetId === 'journal-citations-results-container') {
                dataToExport = journalCitationsCache;
            } else if (targetId === 'cited-by-article-candidates-container') {
                dataToExport = articleCandidatesCache;
            } else if (targetId === 'citing-articles-list') {
                dataToExport = citingArticlesCache;
            } else {
                const articlesNodeList = container.querySelectorAll('.article-card-compact');
                dataToExport = Array.from(articlesNodeList).map(item => {
                    const info = item.querySelector('.article-info');
                    return {
                        title: info?.querySelector('strong')?.textContent || 'N/A',
                        authors: info?.querySelector('.meta-authors')?.textContent.trim() || 'N/A',
                        publicationName: info?.querySelector('.meta-journal')?.textContent.trim() || 'N/A',
                        coverDate: (info?.querySelector('.meta-journal')?.textContent.match(/\((\d{4})\)/) || [])[1] || 'N/A',
                        citedby_count: item.querySelector('.citation-count-compact strong')?.textContent || '0'
                    };
                });
            }

            if (dataToExport.length === 0) {
                alert("没有可导出的数据。");
                return;
            }

            const filename = `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.xlsx`;
            const blob = await fetchAPI('/export-data', { articles: dataToExport, filename: filename });
            if (blob) {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();
            } else {
                alert("导出失败。");
            }
        } else if (chartDownloadBtn) {
            if (currentChart) {
                const url = currentChart.toBase64Image('image/png', 1);
                const a = document.createElement('a');
                a.href = url;
                a.download = `chart_${currentAuthor.name}_${new Date().toISOString().slice(0, 10)}.png`;
                document.body.appendChild(a);
                a.click();
                a.remove();
            } else {
                alert("图表尚未生成，无法下载。");
            }
        } else if (exportHeatmapBtnClick) {
            e.preventDefault();
            if (!heatmapDataCache) {
                alert("没有可导出的图表数据。");
                return;
            }

            const excelData = [];
            const { heatmap_data, x_labels, y_labels, target_journal } = heatmapDataCache;

            const headerRow = { '期刊名称': '期刊名称' };
            x_labels.forEach(year => {
                headerRow[`year_${year}`] = `${year}年`;
            });
            excelData.push(headerRow);

            y_labels.forEach((journal, index) => {
                const row = { '期刊名称': journal };
                x_labels.forEach((year, yearIndex) => {
                    row[`year_${year}`] = heatmap_data[index][yearIndex];
                });
                excelData.push(row);
            });

            const filename = `期刊互引_${target_journal}_${new Date().toISOString().slice(0, 10)}.xlsx`;
            const blob = await fetchAPI('/export-heatmap-data', {
                data: excelData,
                filename: filename,
                target_journal: target_journal
            });

            if (blob) {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();
            } else {
                alert("导出失败。");
            }
        }
    });

    function activateTabById(targetId, shouldReset = true) {
        const targetPane = document.getElementById(targetId);
        if (!targetPane) return false;
        const targetBtn = Array.from(tabButtons).find(btn => btn.dataset.target === targetId);
        if (!targetBtn) return false;

        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabPanes.forEach(pane => pane.classList.remove('active'));
        targetBtn.classList.add('active');
        targetPane.classList.add('active');
        if (shouldReset) resetAllPanes();
        return true;
    }

    function activateTabFromURL() {
        const tabId = new URLSearchParams(window.location.search).get('tab');
        if (!tabId) return;
        activateTabById(tabId, true);
    }

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            activateTabById(button.dataset.target, true);
        });
    });

    // --- Feature-specific Listeners ---
    if(findAuthorBtn) findAuthorBtn.addEventListener('click', () => handleApiButtonClick(findAuthorBtn, async () => { const name = document.getElementById('author-search-query').value.trim(); if (!name) { showError("请输入作者姓名或机构名称。", authorCandidatesContainer); return; } showLoading(authorCandidatesContainer); const data = await fetchAPI('/search-author-by-name', { name }); if (data?.success) { saveHistory('查作者信息', name, data.authors?.length ?? null, { name }); currentAuthorCandidates = data.authors; renderAuthorCandidates(data.authors); showAuthorStage(2); } }));
    if(backToAuthorSearchFromCandidatesBtn) backToAuthorSearchFromCandidatesBtn.addEventListener('click', () => showAuthorStage(1));
    if(backToAuthorSearchBtn) backToAuthorSearchBtn.addEventListener('click', () => showAuthorStage(2));
    if(workFilterInput) workFilterInput.addEventListener('input', () => applyAuthorWorkFilters());
    if(workSortSelect) workSortSelect.addEventListener('change', () => applyAuthorWorkFilters());

    if(searchAuthorCitingBtn) {
        searchAuthorCitingBtn.addEventListener('click', () => handleApiButtonClick(searchAuthorCitingBtn, async () => {
            if (!authorCitingResultsWrapper || !authorCitingResultsContainer) return;
            authorCitingResultsWrapper.style.display = 'none';

            const citingAuthor = document.getElementById('citing-author-name').value.trim();
            const targetJournals = document.getElementById('author-citing-target-journal').value.trim();
            const startYear = document.getElementById('author-citing-start-year').value;
            const endYear = document.getElementById('author-citing-end-year').value;

            if (!citingAuthor || !targetJournals) {
                showError("作者和目标期刊均为必填项。");
                return;
            }
            showLoading(authorCitingResultsContainer);
            const requestBody = { citing_author: citingAuthor, target_journals: targetJournals, start_year: startYear, end_year: endYear };
            const data = await fetchAPI('/search-author-citing', requestBody);

            if (currentSankeyChart) { currentSankeyChart.dispose(); currentSankeyChart = null; }

            if (data?.success) {
                const authorsForDisplay = citingAuthor.split(',').map(a => a.trim()).filter(Boolean).join('、');
                saveHistory('查作者引用', `${authorsForDisplay} → ${targetJournals}（${startYear}-${endYear}）`, data.count,
                    { citing_author: citingAuthor, target_journals: targetJournals, start_year: startYear, end_year: endYear });
                const summaryText = `在 ${startYear}-${endYear} 年间，作者 <strong>${authorsForDisplay}</strong> 共发表了 ${data.count} 篇引用您指定期刊的文章。`;
                renderArticleList(authorCitingResultsContainer, summaryText, data.articles);
                if (data.chart_data?.sankey_nodes?.length > 0) {
                    renderSankeyChart(data.chart_data.sankey_nodes, data.chart_data.sankey_links, authorCitingChartContainer);
                } else { authorCitingChartContainer.innerHTML = '<div class="empty-state"><p>无足够数据生成关系图。（手机端无法查看图表，请使用电脑Edge或者Chrome浏览器）</p></div>'; }
                const citingBarContainer = document.getElementById('author-citing-bar-chart');
                if (citingBarContainer) renderAuthorCitingBarChart(data.articles, citingBarContainer);
                authorCitingResultsWrapper.style.display = 'block';
            } else {
                 showError(data?.error || "检索失败，请重试。", authorCitingResultsContainer);
                 authorCitingResultsWrapper.style.display = 'block';
            }
        }));
    }

    if(searchAuthorNetworkBtn) {
        searchAuthorNetworkBtn.addEventListener('click', () => handleApiButtonClick(searchAuthorNetworkBtn, async () => {
            const authorName = document.getElementById('network-author-name').value.trim();
            const startYear   = document.getElementById('network-start-year').value;
            const endYear     = document.getElementById('network-end-year').value;
            if (!authorName) { showError("请输入作者姓名。", authorNetworkResultsWrapper); return; }
            if (authorNetworkResultsWrapper) authorNetworkResultsWrapper.style.display = 'none';
            if (currentNetworkChart) { currentNetworkChart.dispose(); currentNetworkChart = null; }

            const data = await fetchAPI('/author-network', {
                author_name: authorName, start_year: startYear, end_year: endYear
            });

            if (data?.success) {
                saveHistory('查作者关系', `${authorName}（${startYear}-${endYear}）`, null,
                    { author_name: authorName, start_year: startYear, end_year: endYear });
                if (!data.nodes || data.nodes.length === 0) {
                    if (authorNetworkStats) authorNetworkStats.innerHTML = `<p style="color:var(--text-muted);font-size:0.88rem;">未找到 <strong>${authorName}</strong> 的关系数据，请检查姓名是否正确。</p>`;
                    if (authorNetworkResultsWrapper) authorNetworkResultsWrapper.style.display = 'block';
                    return;
                }
                networkHiddenCategories = new Set();
                if (authorNetworkStats) renderNetworkStats(data.stats, authorName, data.nodes, startYear, endYear);
                bindNetworkLegendInteractions();
                if (authorNetworkResultsWrapper) authorNetworkResultsWrapper.style.display = 'block';
                renderAuthorNetworkChart(data);
            } else {
                showError(data?.error || "检索失败，请重试。");
            }
        }));
    }

    if(searchJournalCitationsBtn) {
        searchJournalCitationsBtn.addEventListener('click', () => handleApiButtonClick(searchJournalCitationsBtn, async () => {
            if (!journalCitationsResultsWrapper || !journalCitationsResultsContainer) return;
            journalCitationsResultsWrapper.style.display = 'none';

            const sourceJournals = document.getElementById('source-journals').value.trim();
            const targetJournals = document.getElementById('journal-target-journal').value.trim();

            if (!sourceJournals || !targetJournals) {
                showError("源期刊和目标期刊均为必填项。");
                return;
            }

            showLoading(journalCitationsResultsContainer);

            const startYear = document.getElementById('journal-start-year').value;
            const endYear = document.getElementById('journal-end-year').value;

            const data = await fetchAPI('/search-journal-citations', {
                source_journals: sourceJournals,
                target_journals: targetJournals,
                start_year: startYear,
                end_year: endYear
            });

            if (currentChordChart) {
                currentChordChart.dispose();
                currentChordChart = null;
            }

            if (data?.success) {
                journalCitationsCache = data.articles || [];

                const targetDisplay = targetJournals.split(',').length > 3
                    ? `${targetJournals.split(',').slice(0, 3).join(', ')} 等${targetJournals.split(',').length}个期刊`
                    : targetJournals;
                saveHistory('查期刊互引', `${sourceJournals} → ${targetDisplay}（${startYear}-${endYear}）`, data.count,
                    { source_journals: sourceJournals, target_journals: targetJournals, start_year: startYear, end_year: endYear });
                const summaryText = `在 ${startYear}-${endYear} 年间，源期刊共引用了 <strong>${targetDisplay}</strong> ${data.count} 次。`;

                renderArticleList(journalCitationsResultsContainer, summaryText, data.articles);

                if (data.chart_data?.heatmap_data?.length > 0) {
                    heatmapDataCache = data.chart_data;

                    renderHeatmapChart(
                        data.chart_data.heatmap_data,
                        data.chart_data.x_labels,
                        data.chart_data.y_labels,
                        data.chart_data.target_journal,
                        journalCitationsChartContainer
                    );

                    const rankingContainer = document.getElementById('journal-ranking-chart');
                    if (rankingContainer) renderJournalRankingChart(data.chart_data, rankingContainer);

                    if (exportHeatmapBtn) {
                        exportHeatmapBtn.style.display = 'inline-block';
                    }
                } else {
                    journalCitationsChartContainer.innerHTML = '<div class="empty-state"><p>无足够数据生成关系图。（手机端无法查看图表，请使用电脑Edge或者Chrome浏览器）</p></div>';
                    const rankingContainer2 = document.getElementById('journal-ranking-chart');
                    if (rankingContainer2) rankingContainer2.innerHTML = '<div class="empty-state"><p>无足够数据生成排行图。</p></div>';
                    if (exportHeatmapBtn) {
                        exportHeatmapBtn.style.display = 'none';
                    }
                }

                journalCitationsResultsWrapper.style.display = 'block';
            } else {
                showError(data?.error || "检索失败，请重试。", journalCitationsResultsContainer);
                journalCitationsResultsWrapper.style.display = 'block';
            }
        }));
    }

    if (findArticleBtn) {
        findArticleBtn.addEventListener('click', () => handleApiButtonClick(findArticleBtn, async () => {
            const identifier = document.getElementById('article-identifier').value.trim();
            if (!identifier) {
                showError("请输入文章标题、DOI或ID。", citedByArticleCandidatesContainer);
                return;
            }
            showLoading(citedByArticleCandidatesContainer);
            const data = await fetchAPI('/find-article', { identifier });
            if (data?.success) {
                saveHistory('查文章被引', identifier, data.articles?.length ?? null, { identifier });
                displayedWorksCache = data.articles || [];
                articleCandidatesCache = displayedWorksCache;
                renderArticleCandidatesInPane(displayedWorksCache);
                showCitedByStage(2);
            }
        }));
    }
    if(backToArticleSearchBtn) backToArticleSearchBtn.addEventListener('click', () => showCitedByStage(1));

    if(articleModalCloseBtn) articleModalCloseBtn.addEventListener('click', () => articleModal.style.display = 'none');
    if(articleModal) articleModal.addEventListener('click', (e) => { if (e.target === articleModal) articleModal.style.display = 'none'; });
    if(citingModalCloseBtn) citingModalCloseBtn.addEventListener('click', () => citingModal.style.display = 'none');
    if(citingModal) citingModal.addEventListener('click', (e) => { if (e.target === citingModal) citingModal.style.display = 'none'; });

    // --- State Management & UI Updates ---
    function showAuthorStage(stage) { [authorStage1, authorStage2, authorStage3].forEach(s => s.style.display = 'none'); if(stage === 1) authorStage1.style.display = 'block'; else if(stage === 2) authorStage2.style.display = 'block'; else if(stage === 3) authorStage3.style.display = 'block'; }
    function showCitedByStage(stage) { [citedByStage1, citedByStage2].forEach(s => s.style.display = 'none'); if(stage === 1) citedByStage1.style.display = 'block'; else if(stage === 2) citedByStage2.style.display = 'block'; }

    function resetAllPanes() {
        showAuthorStage(1);
        showCitedByStage(1);
        if(authorCitingResultsWrapper) authorCitingResultsWrapper.style.display = 'none';
        if(journalCitationsResultsWrapper) journalCitationsResultsWrapper.style.display = 'none';
        if(currentChart) { currentChart.destroy(); currentChart = null; }
        if (currentSankeyChart) { currentSankeyChart.dispose(); currentSankeyChart = null; }
        if (currentChordChart) { currentChordChart.dispose(); currentChordChart = null; }
        if (currentBubbleChart) { currentBubbleChart.dispose(); currentBubbleChart = null; }
        if (currentCitingBarChart) { currentCitingBarChart.dispose(); currentCitingBarChart = null; }
        if (currentJournalRankingChart) { currentJournalRankingChart.dispose(); currentJournalRankingChart = null; }
        if (currentDonutChart) { currentDonutChart.dispose(); currentDonutChart = null; }
        if (currentNetworkChart) { currentNetworkChart.dispose(); currentNetworkChart = null; }
        if (authorNetworkResultsWrapper) authorNetworkResultsWrapper.style.display = 'none';
        if (exportHeatmapBtn) { exportHeatmapBtn.style.display = 'none'; }
        heatmapDataCache = null;
    }

    async function selectAuthor(author) {
        currentAuthor = author;
        showAuthorStage(3);
        const statsContainer = authorCitationStatsContainer;
        const worksContainer = authorWorksContainer;
        const chartContainer = document.getElementById('author-chart-container');
        document.getElementById('selected-author-info-card').innerHTML = createAuthorInfoCard(author);
        showLoading(statsContainer);
        showLoading(worksContainer);
        showLoading(chartContainer);
        const defaultStartYear = 2020;
        const defaultEndYear = new Date().getFullYear();
        const [statsData, worksData, chartData] = await Promise.all([
            fetchAPI('/get-author-citation-stats', { author_id: author.author_id, start_year: defaultStartYear, end_year: defaultEndYear }),
            fetchAPI('/get-works-with-dynamic-citations', { author_id: author.author_id, start_year: defaultStartYear, end_year: defaultEndYear }),
            fetchAPI('/get-author-yearly-stats', { author_id: author.author_id })
        ]);
        if (statsData?.success) renderCitationStats(statsData, defaultStartYear, defaultEndYear, 'author-citation-stats-container', author.author_id, 'author'); else showError("未能获取引用统计数据。", statsContainer);
        if (worksData?.success) { authorWorksCache = worksData.articles; applyAuthorWorkFilters(); renderAuthorBubbleChart(authorWorksCache); } else showError("未能获取该作者的作品列表。", worksContainer);
        if (chartData?.success) renderAuthorChart(chartData.chart_data); else showError("未能获取年度统计图表。", chartContainer);
    }

    function applyAuthorWorkFilters() { if(!workFilterInput || !workSortSelect) return; const filterText = workFilterInput.value.toLowerCase(); const sortValue = workSortSelect.value; let filtered = [...authorWorksCache].filter(work => work.title.toLowerCase().includes(filterText) || work.publicationName.toLowerCase().includes(filterText)); switch(sortValue) { case 'cited_desc': filtered.sort((a, b) => b.citedby_count - a.citedby_count); break; case 'cited_asc':  filtered.sort((a, b) => a.citedby_count - b.citedby_count); break; case 'year_desc':  filtered.sort((a, b) => parseInt(b.coverDate) - parseInt(a.coverDate)); break; case 'year_asc':   filtered.sort((a, b) => parseInt(a.coverDate) - parseInt(b.coverDate)); break; } displayedWorksCache = filtered; renderAuthorWorks(displayedWorksCache); }

    // --- Rendering Functions (Robust Charting) ---
    function renderSankeyChart(nodes, links, container) {
        if (currentSankeyChart) {
            currentSankeyChart.dispose();
            currentSankeyChart = null;
        }

        if (!container || typeof echarts === 'undefined' || !nodes || nodes.length === 0 || !links || links.length === 0) {
            if(container) container.innerHTML = '<div class="empty-state"><p>无足够数据生成关系图。（手机端无法查看图表，请使用电脑Edge或者Chrome浏览器）</p></div>';
            return;
        }

        setTimeout(() => {
            const minHeight = 500;
            const nodeHeight = 40;
            const dynamicHeight = Math.max(minHeight, nodes.length * nodeHeight);
            container.style.height = `${dynamicHeight}px`;

            currentSankeyChart = echarts.init(container);

            const colorMap = {
                '外语教学': '#10b981',
                '现代外语': '#3b82f6',
                '外语教学与研究': '#8b5cf6',
                '外语与外语教学': '#ec4899',
                '中国外语': '#f59e0b',
                '外语学刊': '#06b6d4',
                '外语研究': '#84cc16'
            };

            nodes.forEach(node => {
                if (colorMap[node.name]) {
                    node.itemStyle = { color: colorMap[node.name] };
                } else if (node.depth === 0) {
                    node.itemStyle = { color: '#e879dc' };
                }
            });

            const option = {
                title: {
                    text: '作者发文被引用期刊分布',
                    subtext: '线条粗细表示引用次数',
                    left: 'center',
                    top: 10,
                    textStyle: {
                        fontSize: 18,
                        fontWeight: 'bold'
                    },
                    subtextStyle: {
                        fontSize: 12,
                        color: '#666'
                    }
                },
                tooltip: {
                    trigger: 'item',
                    triggerOn: 'mousemove',
                    formatter: function(params) {
                        if (params.dataType === 'edge') {
                            return `${params.data.source} → ${params.data.target}<br/>引用次数: <strong>${params.data.value}</strong>`;
                        } else {
                            return `${params.data.name}<br/>总引用: <strong>${params.data.value || '未知'}</strong>`;
                        }
                    }
                },
                grid: {
                    left: '5%',
                    right: '5%',
                    top: '80',
                    bottom: '20'
                },
                series: [{
                    type: 'sankey',
                    layout: 'none',
                    layoutIterations: 0,
                    emphasis: {
                        focus: 'adjacency',
                        lineStyle: {
                            opacity: 0.8
                        }
                    },
                    data: nodes,
                    links: links,
                    nodeWidth: 25,
                    nodeGap: 15,
                    nodeAlign: 'justify',
                    lineStyle: {
                        color: 'gradient',
                        curveness: 0.5,
                        opacity: 0.3
                    },
                    label: {
                        color: '#333',
                        fontWeight: 'bold',
                        fontSize: 12,
                        position: 'right',
                        distance: 10,
                        formatter: function(params) {
                            const maxLen = 15;
                            if (params.name.length > maxLen) {
                                return params.name.substring(0, maxLen) + '...';
                            }
                            return params.name;
                        }
                    },
                    emphasis: {
                        label: {
                            fontSize: 14,
                            fontWeight: 'bolder'
                        }
                    }
                }]
            };

            currentSankeyChart.setOption(option);

            window.addEventListener('resize', function() {
                if (currentSankeyChart) {
                    currentSankeyChart.resize();
                }
            });
        }, 0);
    }

    function renderHeatmapChart(heatmapData, xLabels, yLabels, targetJournal, container) {
        if (currentChordChart) { currentChordChart.dispose(); currentChordChart = null; }

        if (!container || typeof echarts === 'undefined' || !heatmapData || heatmapData.length === 0) {
            if(container) container.innerHTML = '<div class="empty-state"><p>无足够数据生成关系图。（手机端无法查看图表，请使用电脑Edge或者Chrome浏览器）</p></div>';
            return;
        }

        setTimeout(() => {
            const minHeight = 400;
            const rowHeight = 35;
            const dynamicHeight = Math.max(minHeight, yLabels.length * rowHeight + 150);
            container.style.height = `${dynamicHeight}px`;

            currentChordChart = echarts.init(container);

            const chartData = [];
            let maxValue = 0;

            for (let i = 0; i < yLabels.length; i++) {
                for (let j = 0; j < xLabels.length; j++) {
                    const value = heatmapData[i][j];
                    chartData.push([j, i, value]);
                    if (value > maxValue) maxValue = value;
                }
            }

            const leftMargin = yLabels.length > 10 ? '180' : '140';

            const option = {
                title: {
                    text: `各期刊引用《${targetJournal}》的年度分布`,
                    left: 'center',
                    top: '10',
                    textStyle: {
                        fontSize: 16,
                        fontWeight: 'bold'
                    }
                },
                tooltip: {
                    position: 'top',
                    formatter: function(params) {
                        return `<strong>${yLabels[params.data[1]]}</strong><br/>
                                ${xLabels[params.data[0]]}年<br/>
                                引用次数: <strong>${params.data[2]}</strong>`;
                    }
                },
                grid: {
                    left: leftMargin,
                    right: '80',
                    top: '60',
                    bottom: '40',
                    containLabel: false
                },
                xAxis: {
                    type: 'category',
                    data: xLabels,
                    splitArea: {
                        show: true
                    },
                    axisLabel: {
                        interval: 0,
                        fontSize: 12,
                        fontWeight: '500'
                    }
                },
                yAxis: {
                    type: 'category',
                    data: yLabels,
                    splitArea: {
                        show: true
                    },
                    axisLabel: {
                        fontSize: 10,
                        width: leftMargin === '180' ? 160 : 120,
                        overflow: 'truncate',
                        ellipsis: '...',
                        interval: 0
                    }
                },
                visualMap: {
                    min: 0,
                    max: maxValue > 0 ? maxValue : 1,
                    calculable: true,
                    orient: 'vertical',
                    right: '10',
                    top: 'center',
                    inRange: {
                        color: ['#f0f9ff', '#bae6fd', '#7dd3fc', '#38bdf8', '#0ea5e9', '#0284c7', '#0369a1']
                    },
                    text: ['高', '低'],
                    textStyle: {
                        color: '#333',
                        fontSize: 11
                    }
                },
                series: [{
                    name: '引用次数',
                    type: 'heatmap',
                    data: chartData,
                    label: {
                        show: true,
                        formatter: function(params) {
                            return params.data[2] > 0 ? params.data[2] : '';
                        },
                        fontSize: 10,
                        fontWeight: 'bold'
                    },
                    emphasis: {
                        itemStyle: {
                            shadowBlur: 10,
                            shadowColor: 'rgba(0, 0, 0, 0.5)'
                        }
                    },
                    itemStyle: {
                        borderColor: '#fff',
                        borderWidth: 1
                    }
                }]
            };

            currentChordChart.setOption(option);
        }, 0);
    }

    function renderAuthorChart(chartData) {
        const chartContainer = document.getElementById('author-chart-container');
        if (!chartContainer || typeof Chart === 'undefined') {
             if(chartContainer) chartContainer.innerHTML = '<div class="empty-state"><p>图表库加载失败，无法生成图表。（手机端无法查看图表，请使用电脑Edge或者Chrome浏览器）</p></div>';
            return;
        }
        chartContainer.innerHTML = '<canvas id="author-yearly-chart"></canvas>';
        const ctx = document.getElementById('author-yearly-chart').getContext('2d');
        if (currentChart) { currentChart.destroy(); }
        currentChart = new Chart(ctx, { type: 'bar', data: { labels: chartData.labels, datasets: [ { label: '发文量', data: chartData.publications, backgroundColor: 'rgba(59, 130, 246, 0.6)', yAxisID: 'y' }, { label: '被引量', data: chartData.citations, backgroundColor: 'rgba(16, 185, 129, 0.2)', borderColor: 'rgba(16, 185, 129, 1)', type: 'line', yAxisID: 'y1', tension: 0.4, fill: true } ] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, title: { display: true, text: '发文量' } }, y1: { type: 'linear', position: 'right', beginAtZero: true, title: { display: true, text: '被引量' }, grid: { drawOnChartArea: false } } } } });
    }

    function renderArticleList(container, summaryText, articles = []) {
        if (!container) return;
        let html = `<div class="result-summary"><p>${summaryText || ''}</p></div>`;
        if (articles.length > 0) {
            html += `<div class="list-controls"><div class="list-header"><h3>结果列表</h3><button class="btn-secondary-small btn-export" data-target="${container.id}" data-filename-prefix="journal_citations">导出至Excel</button></div></div>`;
            html += `<div class="content-container">${articles.map(article => createArticleCardCompact(article)).join('')}</div>`;
        } else {
            html += '<div class="empty-state"><p>没有找到符合条件的结果。</p></div>';
        }
        container.innerHTML = html;
        container.querySelectorAll('.toggle-references-btn').forEach(button => { button.addEventListener('click', (e) => { const content = e.target.closest('.article-card-compact').querySelector('.references-content'); if (content) { const isHidden = content.classList.toggle('hidden'); e.target.textContent = isHidden ? '显示参考文献' : '隐藏参考文献'; } }); });
    }

    function renderEmptyState(container, message) { if(container) container.innerHTML = `<div class="empty-state"><svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg><p>${message}</p></div>`; }
    function renderCitingArticles(articles) {
        citingArticlesCache = articles || [];
        if (!articles || articles.length === 0) {
            renderEmptyState(citingModalList, "未找到相关的引用文献。");
            return;
        }
        citingModalList.innerHTML = `<div class="content-container">${articles.map(article => `<div class="article-card citing-article-item" data-article-id="${article.id}"><h4>${article.title || 'N/A'}</h4><div class="meta-group"><span class="meta-item meta-authors"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>${article.authors || 'N/A'}</span><span class="meta-item meta-journal"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>${article.publicationName || 'N/A'} (${article.coverDate})</span></div></div>`).join('')}</div>`;
    }
    function renderAuthorWorks(articles) { if (!authorWorksContainer) return; if (!articles || articles.length === 0) { renderEmptyState(authorWorksContainer, "未找到该作者的相关文章。"); return; } authorWorksContainer.innerHTML = articles.map(article => createArticleCardCompact(article)).join(''); authorWorksContainer.querySelectorAll('.toggle-references-btn').forEach(button => { button.addEventListener('click', (e) => { const content = e.target.closest('.article-card-compact').querySelector('.references-content'); if(content) { const isHidden = content.classList.toggle('hidden'); e.target.textContent = isHidden ? '显示参考文献' : '隐藏参考文献'; } }); }); }
    function renderArticleCandidatesInPane(articles) { if (!citedByArticleCandidatesContainer) return; if (!articles || articles.length === 0) { renderEmptyState(citedByArticleCandidatesContainer, "未找到匹配的文章。"); return; } citedByArticleCandidatesContainer.innerHTML = `<div class="content-container">${articles.map(article => { const authorsHTML = article.authors ? `<span class="meta-item meta-authors"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>${article.authors}</span>` : ''; const journalHTML = `<span class="meta-item meta-journal"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>${article.publicationName || 'N/A'} (${article.coverDate || 'N/A'})</span>`; return `<div class="article-card-selectable citing-article-item" data-article-id="${article.id}"><div class="article-info"><strong>${article.title || '无标题'}</strong><div class="meta-group">${authorsHTML}${journalHTML}</div></div><div class="citation-count"><span>总被引</span><strong>${article.citedby_count}</strong></div></div>`; }).join('')}</div>`; }

    function normalizeAffiliationItems(author) {
        const grouped = new Map();

        const collectAffiliation = (name, count = 1) => {
            const cleanName = String(name || '').trim();
            if (!cleanName) return;

            const key = cleanName.replace(/[\s,，;；:：。·•/、\-\(\)（）\[\]【】]/g, '');
            if (!key) return;

            const numericCount = Number(count);
            const safeCount = Number.isFinite(numericCount) && numericCount > 0 ? numericCount : 1;
            const current = grouped.get(key);

            if (!current) {
                grouped.set(key, { name: cleanName, count: safeCount });
                return;
            }

            current.count += safeCount;
            if (cleanName.length > current.name.length) {
                current.name = cleanName;
            }
        };

        if (Array.isArray(author?.affiliations) && author.affiliations.length > 0) {
            author.affiliations.forEach(item => {
                if (typeof item === 'string') {
                    collectAffiliation(item, 1);
                } else if (item && typeof item === 'object') {
                    collectAffiliation(item.name, item.count);
                }
            });
        }

        if (!grouped.size && author?.affiliation) {
            collectAffiliation(author.affiliation, 1);
        }

        if (!grouped.size) {
            collectAffiliation('未知机构', 1);
        }

        return Array.from(grouped.values()).sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count;
            return a.name.localeCompare(b.name, 'zh-Hans-CN');
        });
    }

    function buildAffiliationChipHTML(author) {
        const items = normalizeAffiliationItems(author);
        return items.map((item, index) => {
            const countHTML = item.count > 1 ? `<em>x${item.count}</em>` : '';
            return `<span class="affiliation-chip tone-${index % 6}"><span class="chip-name">${escapeHTML(item.name)}</span>${countHTML}</span>`;
        }).join('');
    }

    function renderAuthorCandidates(authors) {
        if (!authors.length) {
            renderEmptyState(authorCandidatesContainer, "未找到匹配的作者或机构。");
            return;
        }

        const html = authors.map((author, index) => `
            <div class="author-card-selectable" data-index="${index}">
                <div class="author-info">
                    <strong>${escapeHTML(author.name || '未知作者')}</strong>
                    <div class="meta institution">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                            <polyline points="9 22 9 12 15 12 15 22"></polyline>
                        </svg>
                        <div class="affiliation-chip-list">${buildAffiliationChipHTML(author)}</div>
                    </div>
                </div>
                <div class="citation-count">
                    <span>总被引</span>
                    <strong>${author.cited_by_count || 0}</strong>
                </div>
            </div>
        `).join('');

        authorCandidatesContainer.innerHTML = `<div class="content-container">${html}</div>`;
        authorCandidatesContainer.querySelectorAll('.author-card-selectable').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.tagName !== 'A') {
                    const selectedAuthor = currentAuthorCandidates[Number(e.currentTarget.dataset.index)];
                    selectAuthor(selectedAuthor);
                }
            });
        });
    }

    function renderCitationStats(data, startYear, endYear, containerId, targetId, targetType) {
        const statsContainer = document.getElementById(containerId);
        if (!statsContainer) return;
        if (!data || !data.success) {
            showError("未能获取引用统计数据。", statsContainer);
            return;
        }
        statsContainer.innerHTML = `<div class="citation-stats-card"><div class="stats-header"><h3>引用来源分析</h3><div class="date-range-picker"><label>统计范围:</label><input type="number" id="citation-start-year" value="${startYear}"><span>-</span><input type="number" id="citation-end-year" value="${endYear}"><button id="update-stats-btn" class="btn-primary-small">更新</button></div></div><div id="stats-grid-container" class="stats-grid detailed">${createStatsGridHTML(data.stats, targetId, targetType)}</div></div>`;

        const updateBtn = statsContainer.querySelector('#update-stats-btn');
        if (updateBtn) {
            updateBtn.addEventListener('click', () => handleApiButtonClick(updateBtn, async () => {
                const newStartYear = statsContainer.querySelector('#citation-start-year').value;
                const newEndYear = statsContainer.querySelector('#citation-end-year').value;
                const gridContainer = statsContainer.querySelector('#stats-grid-container');
                showLoading(gridContainer);
                if (targetType === 'author') showLoading(authorWorksContainer);
                const id_key = targetType === 'article' ? 'article_id' : 'author_id';
                const body = { [id_key]: targetId, start_year: newStartYear, end_year: newEndYear };
                const endpoint = targetType === 'article' ? '/analyze-article-citations' : '/get-author-citation-stats';
                const newStatsData = await fetchAPI(endpoint, body);
                if (newStatsData?.success) {
                    gridContainer.innerHTML = createStatsGridHTML(newStatsData.stats, targetId, targetType);
                } else {
                    showError("未能获取新的统计数据。", gridContainer);
                }
                if (targetType === 'author') {
                    const newWorksData = await fetchAPI('/get-works-with-dynamic-citations', { author_id: targetId, start_year: newStartYear, end_year: newEndYear });
                    if (newWorksData?.success) {
                        authorWorksCache = newWorksData.articles;
                        applyAuthorWorkFilters();
                    } else {
                        showError("未能获取新的作品列表。", authorWorksContainer);
                    }
                }
            }));
        }
    }

    function createStatsGridHTML(stats, targetId, targetType) {
        const createLink = (count, type, label) => count > 0
            ? `<a href="#" class="stat-value stat-value-link" data-target-id="${targetId}" data-target-type="${targetType}" data-citation-type="${type}" data-citation-label="${label}">${count}</a>`
            : `<span class="stat-value">${count}</span>`;

        const cssciCount = stats['外语C刊'] || 0;
        const coreCount = stats['外语核心期刊'] || 0;
        const collectiveCount = stats['外语C集刊'] || 0;

        return `
            <div class="total-container">
                ${createLink(stats.total || 0, 'Total', '总')}
                <span class="stat-label">总被引次数</span>
            </div>
            <div class="breakdown-grid">
                <div class="stat-item">${createLink(cssciCount, 'CSSCI', '被外语C刊')} <span class="stat-label">被外语C刊引用</span></div>
                <div class="stat-item">${createLink(coreCount, 'Core', '被外语C扩')} <span class="stat-label">被外语C扩引用</span></div>
                <div class="stat-item">${createLink(collectiveCount, 'Collective', '被外语集刊')} <span class="stat-label">被外语集刊引用</span></div>
            </div>
        `;
    }

    async function showArticleModalWithAnalysis(analysisData) {
        articleModalBody.innerHTML = renderArticleDetailHTML(analysisData.details, analysisData.stats);
        articleModal.style.display = 'flex';
        if (analysisData.stats) {
            const defaultStartYear = new Date().getFullYear() - 5;
            const defaultEndYear = new Date().getFullYear();
            renderCitationStats(analysisData, defaultStartYear, defaultEndYear, 'modal-stats-container', currentArticle.id, 'article');
            // NEW: render donut chart for citation source distribution
            setTimeout(() => {
                const donutContainer = document.getElementById('modal-donut-chart');
                if (donutContainer && analysisData.stats) renderCitationDonutChart(analysisData.stats, donutContainer);
            }, 100);
        }
    }

    function escapeHTML(text) {
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function parseReferenceEntries(referenceText) {
        const normalized = String(referenceText || '')
            .replace(/\r\n?/g, '\n')
            .replace(/^\s*参考文献[:：]?\s*/i, '')
            .trim();
        if (!normalized) return [];

        const lines = normalized.split(/\n+/).map(line => line.trim()).filter(Boolean);
        let entries = [];

        if (lines.length > 1) {
            let currentEntry = '';
            lines.forEach((line) => {
                if (/^\[\d+\]/.test(line)) {
                    if (currentEntry) entries.push(currentEntry.trim());
                    currentEntry = line;
                } else if (currentEntry) {
                    currentEntry += ` ${line}`;
                } else {
                    currentEntry = line;
                }
            });
            if (currentEntry) entries.push(currentEntry.trim());
        } else {
            entries = normalized.split(/(?=\[\d+\])/).map(item => item.trim()).filter(Boolean);
        }

        if (entries.length <= 1 && /\[\d+\]/.test(normalized)) {
            entries = normalized.split(/(?=\[\d+\])/).map(item => item.trim()).filter(Boolean);
        }

        return entries
            .map(entry => entry.replace(/^\[\d+\]\s*/, '').trim())
            .filter(Boolean);
    }

    function getReferenceTypeCode(entry) {
        const upper = String(entry || '').toUpperCase();
        const match = upper.match(/\[([A-Z])(?:\/[A-Z]+)?\]/);
        if (match && match[1]) {
            const code = match[1];
            if (['M', 'C', 'N', 'J', 'D', 'R', 'S', 'P', 'A', 'Z'].includes(code)) {
                return code;
            }
        }
        return 'Z';
    }

    function renderGroupedReferences(referenceText) {
        const entries = parseReferenceEntries(referenceText);
        if (!entries.length) {
            return '<p class="reference-empty">暂无可解析参考文献。</p>';
        }

        const grouped = {
            M: [],
            C: [],
            N: [],
            J: [],
            D: [],
            R: [],
            S: [],
            P: [],
            A: [],
            Z: []
        };
        entries.forEach((entry) => {
            grouped[getReferenceTypeCode(entry)].push(entry);
        });

        const sectionMeta = [
            { key: 'M', title: 'M——专著' },
            { key: 'C', title: 'C——论文集' },
            { key: 'N', title: 'N——报纸文章' },
            { key: 'J', title: 'J——期刊文章' },
            { key: 'D', title: 'D——学位论文' },
            { key: 'R', title: 'R——研究报告' },
            { key: 'S', title: 'S——标准' },
            { key: 'P', title: 'P——专利' },
            { key: 'A', title: 'A——专著、论文集中的析出文献' },
            { key: 'Z', title: 'Z——其他未说明的文献类型' }
        ];

        const sectionHTML = sectionMeta
            .filter(section => grouped[section.key].length > 0)
            .map((section) => {
                const itemsHTML = grouped[section.key]
                    .map((entry, index) => (
                        `<li class="reference-item">` +
                        `<span class="reference-index">[${index + 1}]</span>` +
                        `<span class="reference-text">${escapeHTML(entry)}</span>` +
                        `</li>`
                    ))
                    .join('');
                return (
                    `<section class="reference-section reference-section-${section.key}">` +
                    `<div class="reference-section-header">` +
                    `<span class="reference-badge">${section.key}</span>` +
                    `<h5>${section.title}</h5>` +
                    `</div>` +
                    `<ol class="reference-list">${itemsHTML}</ol>` +
                    `</section>`
                );
            })
            .join('');

        return `<div class="reference-sections">${sectionHTML}</div>`;
    }

    function renderArticleDetailHTML(article, stats) {
        if (!article) return '<div class="error-message">无法加载文章详情。</div>';
        const statsContainerHTML = stats ? `<div id="modal-stats-container"></div><div id="modal-donut-chart" style="height:220px; margin-top:1rem;"></div>` : '';
        const citingUrl = (article.doi && article.doi !== '暂无') ? `https://doi.org/${article.doi}` : '#';
        const referencesBoxHTML = article.reference ? `<div class="references-box"><h4>参考文献</h4>${renderGroupedReferences(article.reference)}</div>` : '';
        const keywordsHTML = article.keywords ? `<div class="keywords-box"><h4>关键词</h4><div class="keywords-container">${article.keywords.split(';').map(kw => kw.trim() ? `<span>${escapeHTML(kw.trim())}</span>` : '').join('')}</div></div>` : '';
        return `<h2>文章详情</h2>${statsContainerHTML}<h3 class="detail-title">${escapeHTML(article.title || 'N/A')}</h3><p class="meta"><strong>作者:</strong> ${escapeHTML(article.authors || 'N/A')}</p><p class="meta"><strong>机构:</strong> ${escapeHTML(article.institution || 'N/A')}</p><p class="meta"><strong>期刊:</strong> ${escapeHTML(article.publicationName || 'N/A')} (${escapeHTML(article.coverDate?.substring(0, 4) || 'N/A')})</p><p class="meta"><strong>发表日期:</strong> ${escapeHTML(article.fullDate || 'N/A')}</p>${keywordsHTML}<div class="abstract-box"><h4>摘要</h4><p>${escapeHTML(article.abstract || '摘要不可用。')}</p></div>${referencesBoxHTML}<a href="${citingUrl}" target="_blank" rel="noopener noreferrer" class="btn-primary" style="margin-top: 24px;">查看原文 (如DOI有效)</a>`;
    }

    function createArticleCardCompact(article) {
        const rightAlignedContentHTML = `<div class="right-aligned-content"><div class="citation-count-compact"><span>被引</span><strong>${article.citedby_count}</strong></div>${article.reference ? `<div class="article-card-actions"><button class="toggle-references-btn">显示参考文献</button></div>` : ''}</div>`;
        const matchInfoHTML = article.matched_for ? `<span class="meta-item meta-match-info">${escapeHTML(article.matched_for)}</span>` : '';
        const mainContentHTML = `<div class="article-card-main-content"><div class="article-info citing-article-item" data-article-id="${article.id}"><strong>${escapeHTML(article.title || 'N/A')}</strong><div class="meta-group"><span class="meta-item meta-authors"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>${escapeHTML(article.authors || 'N/A')}</span><span class="meta-item meta-journal"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>${escapeHTML(article.publicationName || 'N/A')} (${escapeHTML(article.coverDate || 'N/A')})</span>${matchInfoHTML}</div></div>${rightAlignedContentHTML}</div>`;
        const referencesContentHTML = article.reference ? `<div class="references-content hidden">${renderGroupedReferences(article.reference)}</div>` : '';
        return `<div class="article-card-compact">${mainContentHTML}${referencesContentHTML}</div>`;
    }

    function createAuthorInfoCard(author) { const affiliationHTML = author.affiliation && author.affiliation !== 'N/A' ? `机构: ${author.affiliation}` : ''; return `<div class="result-summary"> <p>已选定:<strong>${author.name}</strong></p> <p class="meta">${affiliationHTML}</p> </div>`; }
    function showLoading(container) { if(container) container.innerHTML = `<div class="loading-spinner"><svg width="48" height="48" viewBox="0 0 24 24"><path fill="currentColor" d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/><path fill="currentColor" d="M10.72,19.9a8,8,0,0,1-6.5-9.79A7.77,7.77,0,0,1,10.4,4.16a8,8,0,0,1,9.49,6.52A1.54,1.54,0,0,0,21.38,12h.13a1.37,1.37,0,0,0,1.38-1.54,11,11,0,1,0-12.7,12.39A1.54,1.54,0,0,0,12,21.34h0A1.47,1.47,0,0,0,10.72,19.9Z"><animateTransform attributeName="transform" type="rotate" dur="0.75s" values="0 12 12;360 12 12" repeatCount="indefinite"/></path></svg></div>`; }
    function showError(message, container = null) { const errorHtml = `<div class="error-message"><strong>错误:</strong> ${message}</div>`; if (container) { container.innerHTML = errorHtml; } else { alert(`错误: ${message}`); } }

    // --- Quick Add & Fill Logic ---
    function getJournalsFromCategories(type = null, journalList = []) {
        const journals = new Set();

        if (type) {
            const categoriesToScan = QUICK_FILL_CATEGORY_MAP[type];
            if (!categoriesToScan) return [];
            for (const catName of categoriesToScan) {
                const category = JOURNAL_CATEGORIES[catName];
                if (category) {
                    for (const subCatName in category.subcategories) {
                        category.subcategories[subCatName].forEach(journal => {
                            if (journal.cnTitle) journals.add(journal.cnTitle);
                        });
                    }
                }
            }
            return Array.from(journals);
        }

        if (journalList.length > 0) {
            const journalSet = new Set(journalList);
            for (const key of Object.keys(QUICK_FILL_CATEGORY_MAP)) {
                const categoryJournals = new Set(getJournalsFromCategories(key));
                if (categoryJournals.size === journalSet.size && [...categoryJournals].every(j => journalSet.has(j))) {
                    return key;
                }
            }
        }

        return null;
    }

    function generateQuickAddHTML(categories) {
        let html = '';
        const extraCategoryNames = Object.keys(categories).filter(
            name => !ORDERED_JOURNAL_CATEGORY_LABELS.includes(name)
        );
        const orderedCategoryNames = [...ORDERED_JOURNAL_CATEGORY_LABELS, ...extraCategoryNames];

        orderedCategoryNames.forEach((categoryName) => {
            const category = categories[categoryName];
            if (!category?.subcategories) return;

            html += `<div class="quick-add-category"><h4 class="btn-toggle-visibility" data-target="${categoryName}">${categoryName}</h4><div class="quick-add-buttons-wrapper hidden" data-category="${categoryName}">`;
            Object.keys(category.subcategories).forEach((subcategoryName) => {
                html += `<div class="subcategory-group"><p>${subcategoryName}</p><div class="quick-add-buttons">`;
                category.subcategories[subcategoryName].forEach((journal) => {
                    const journalTitle = journal.cnTitle;
                    const buttonText = journal.cnTitle;
                    const isDisabled = !journalTitle;
                    const titleAttr = isDisabled ? 'title="暂无对应的中文刊名"' : '';
                    const journalData = isDisabled ? '' : `data-journal="${journalTitle}"`;
                    html += `<button class="btn-quick-add" ${journalData} ${isDisabled ? 'disabled' : ''} ${titleAttr}>${buttonText}</button>`;
                });
                html += `</div></div>`;
            });
            html += `</div></div>`;
        });

        return html;
    }

    function initializeJournalPickers() {
        const pickers = document.querySelectorAll('.journal-picker-container');
        pickers.forEach(picker => {
            const quickFillContainer = picker.querySelector('.quick-fill-container');
            const quickAddContainer = picker.querySelector('.quick-add-container');
            const targetInput = picker.querySelector('.journal-input');
            if (!targetInput) return;

            const updateUI = () => {
                const currentJournals = targetInput.value.split(',').map(j => j.trim()).filter(Boolean);
                const currentJournalSet = new Set(currentJournals);
                if (quickAddContainer) {
                    quickAddContainer.querySelectorAll('.btn-quick-add').forEach(btn => {
                        const journal = btn.dataset.journal;
                        btn.classList.toggle('selected', currentJournalSet.has(journal));
                    });
                }
                if (quickFillContainer) {
                    const matchedCategory = getJournalsFromCategories(null, currentJournals);
                    quickFillContainer.querySelectorAll('.btn-quick-fill').forEach(btn => {
                        btn.classList.toggle('selected', btn.dataset.type === matchedCategory);
                    });
                }
            };

            if (quickFillContainer) {
                quickFillContainer.querySelectorAll('.btn-quick-fill').forEach(button => {
                    button.addEventListener('click', e => {
                        e.preventDefault();
                        const type = e.target.dataset.type;
                        if (type === 'clear') {
                            targetInput.value = '';
                        } else {
                            const journals = getJournalsFromCategories(type);
                            if (!journals || journals.length === 0) {
                                showError("期刊目录未加载，快捷填充不可用。请先手动输入目标期刊，或检查服务端目录文件。");
                                return;
                            }
                            targetInput.value = journals.join(', ');
                        }
                        updateUI();
                    });
                });
            }

            if (quickAddContainer) {
                quickAddContainer.querySelectorAll('.btn-quick-add').forEach(button => {
                    button.addEventListener('click', (event) => {
                        event.preventDefault();
                        const clickedButton = event.currentTarget;
                        const journalToAdd = clickedButton.dataset.journal;
                        if (!journalToAdd) return;

                        const isMultiSelect = quickFillContainer !== null;

                        if (isMultiSelect) {
                            const currentJournals = new Set(targetInput.value.split(',').map(j => j.trim()).filter(Boolean));
                            if (currentJournals.has(journalToAdd)) {
                                currentJournals.delete(journalToAdd);
                            } else {
                                currentJournals.add(journalToAdd);
                            }
                            targetInput.value = Array.from(currentJournals).join(', ');
                        } else {
                            if (targetInput.value === journalToAdd) {
                                targetInput.value = '';
                            } else {
                                targetInput.value = journalToAdd;
                            }
                        }
                        updateUI();
                    });
                });
            }
            targetInput.addEventListener('input', updateUI);
            updateUI();
        });
    }

    function addQuickAddEventListeners(container) {
        if (!container) return;
        container.querySelectorAll('.btn-toggle-visibility').forEach(button => {
            button.addEventListener('click', (e) => {
                const wrapper = e.currentTarget.nextElementSibling;
                if (wrapper) {
                    wrapper.classList.toggle('hidden');
                }
            });
        });
    }

    function initializeAllQuickAdd() {
        const quickAddHTML = generateQuickAddHTML(JOURNAL_CATEGORIES);
        document.querySelectorAll('.quick-add-container').forEach(container => {
            container.innerHTML = quickAddHTML;
            addQuickAddEventListeners(container);
        });
    }

    async function loadJournalCatalog() {
        try {
            const response = await fetch('/api/get-journal-catalog', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            if (!response.ok) {
                JOURNAL_CATEGORIES = {};
                return false;
            }
            const data = await response.json();
            if (data?.success && data.catalog && Object.keys(data.catalog).length > 0) {
                JOURNAL_CATEGORIES = data.catalog;
                return true;
            }
        } catch (error) {
            console.warn('Failed to load journal catalog:', error);
        }
        JOURNAL_CATEGORIES = {};
        return false;
    }

    // ================================================================
    // NEW CHARTS — Premium Analytics Suite
    // ================================================================

    /**
     * Chart A (Feature 1): Author Impact Scatter Plot
     * X = publication year, Y = citation count, point = one article
     */
    function renderAuthorBubbleChart(articles) {
        const container = document.getElementById('author-bubble-chart');
        if (!container || typeof echarts === 'undefined' || !articles || articles.length === 0) {
            if (container) container.innerHTML = '<div class="empty-state"><p>暂无数据可生成散点图。</p></div>';
            return;
        }
        if (currentBubbleChart) { currentBubbleChart.dispose(); currentBubbleChart = null; }

        const data = articles
            .filter(a => a.coverDate && !isNaN(parseInt(a.citedby_count)))
            .map(a => ({
                value: [parseInt(a.coverDate), parseInt(a.citedby_count || 0), parseInt(a.citedby_count || 0)],
                name: a.title || 'N/A',
                journal: a.publicationName || ''
            }));

        if (data.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>暂无数据可生成散点图。</p></div>';
            return;
        }

        const maxCite = Math.max(...data.map(d => d.value[1]), 1);

        setTimeout(() => {
        currentBubbleChart = echarts.init(container);
        currentBubbleChart.setOption({
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'item',
                formatter: p => `<div style="max-width:240px;line-height:1.5;"><strong>${p.data.name}</strong><br/>期刊：${p.data.journal}<br/>年份：${p.value[0]}<br/>被引：<strong>${p.value[1]}</strong></div>`
            },
            grid: { left: '8%', right: '5%', top: '10%', bottom: '14%', containLabel: true },
            xAxis: {
                type: 'value',
                name: '发表年份',
                nameLocation: 'end',
                nameTextStyle: { color: '#8A9BB0', fontSize: 11 },
                min: value => Math.max(value.min - 1, 2000),
                max: value => value.max + 1,
                interval: 1,
                axisLabel: { color: '#8A9BB0', fontSize: 10, formatter: v => v.toString() },
                splitLine: { lineStyle: { color: '#EEF2F7', type: 'dashed' } },
                axisLine: { lineStyle: { color: '#E2E8F0' } }
            },
            yAxis: {
                type: 'value',
                name: '被引次数',
                nameTextStyle: { color: '#8A9BB0', fontSize: 11 },
                axisLabel: { color: '#8A9BB0', fontSize: 10 },
                splitLine: { lineStyle: { color: '#EEF2F7', type: 'dashed' } },
                axisLine: { lineStyle: { color: '#E2E8F0' } }
            },
            series: [{
                type: 'scatter',
                data: data,
                symbolSize: d => {
                    const ratio = d[1] / maxCite;
                    return Math.max(8, Math.round(ratio * 36) + 8);
                },
                itemStyle: {
                    color: p => {
                        const ratio = p.data.value[1] / maxCite;
                        const r = Math.round(12 + ratio * (16 - 12));
                        const g = Math.round(149 - ratio * (149 - 80));
                        const b = Math.round(113 - ratio * (113 - 40));
                        return `rgba(${r}, ${g}, ${b}, 0.75)`;
                    },
                    borderColor: 'rgba(12,149,113,0.3)',
                    borderWidth: 1
                },
                emphasis: {
                    itemStyle: { borderColor: '#0C9571', borderWidth: 2, shadowBlur: 8, shadowColor: 'rgba(12,149,113,0.3)' }
                }
            }]
        });
        }, 0);
    }

    /**
     * Chart B (Feature 2): Author Citing — Year-wise citation distribution (stacked bar)
     * Shows distribution of articles by publishing journal (horizontal sorted bar)
     * More meaningful than year-stacked: reveals where the author publishes citing work
     */
    function renderAuthorCitingBarChart(articles, container) {
        if (!container || typeof echarts === 'undefined' || !articles || articles.length === 0) {
            if (container) container.innerHTML = '<div class="empty-state"><p>暂无数据可生成发文期刊分布图。</p></div>';
            return;
        }
        if (currentCitingBarChart) { currentCitingBarChart.dispose(); currentCitingBarChart = null; }

        // Build journal → count + year range map
        const journalMap = {};
        articles.forEach(a => {
            const journal = a.publicationName || '未知期刊';
            const year = parseInt(String(a.coverDate || '').substring(0, 4));
            if (!journalMap[journal]) journalMap[journal] = { count: 0, years: [] };
            journalMap[journal].count++;
            if (!isNaN(year)) journalMap[journal].years.push(year);
        });

        // Sort ascending by count (so highest appears at top in horizontal bar)
        const sorted = Object.entries(journalMap)
            .map(([j, d]) => ({ journal: j, count: d.count, years: d.years }))
            .sort((a, b) => a.count - b.count);

        if (sorted.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>暂无期刊分布数据。</p></div>';
            return;
        }

        const labels = sorted.map(s => s.journal);
        const values = sorted.map(s => s.count);
        const maxVal = Math.max(...values, 1);
        const palette = ['#0C9571','#3B82F6','#F59E0B','#EC4899','#8B5CF6','#06B6D4','#10B981','#6366F1','#EF4444','#84CC16'];

        const dynamicH = Math.max(200, labels.length * 38 + 60);
        container.style.height = `${dynamicH}px`;

        setTimeout(() => {
        currentCitingBarChart = echarts.init(container);
        currentCitingBarChart.setOption({
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: p => {
                    const d = sorted[p[0].dataIndex];
                    const yearStr = d.years.length ? `${Math.min(...d.years)}–${Math.max(...d.years)}` : '—';
                    return `${p[0].name}<br/>发文数：<strong>${p[0].value}</strong><br/>年份范围：${yearStr}`;
                }
            },
            grid: { left: '2%', right: '10%', top: '4%', bottom: '4%', containLabel: true },
            xAxis: {
                type: 'value',
                minInterval: 1,
                axisLabel: { color: '#8A9BB0', fontSize: 10 },
                splitLine: { lineStyle: { color: '#EEF2F7', type: 'dashed' } }
            },
            yAxis: {
                type: 'category',
                data: labels,
                axisLabel: {
                    color: '#4D5E70', fontSize: 10,
                    width: 140, overflow: 'truncate', ellipsis: '…'
                },
                axisLine: { lineStyle: { color: '#E2E8F0' } }
            },
            series: [{
                type: 'bar',
                data: values.map((v, i) => ({
                    value: v,
                    itemStyle: {
                        color: palette[i % palette.length],
                        opacity: 0.5 + (v / maxVal) * 0.5,
                        borderRadius: [0, 4, 4, 0]
                    }
                })),
                label: {
                    show: true, position: 'right',
                    color: '#4D5E70', fontSize: 10,
                    formatter: p => p.value > 0 ? `${p.value} 篇` : ''
                },
                barMaxWidth: 24
            }]
        });
        }, 0);
    }

    /**
     * Chart C (Feature 3): Journal Ranking — total citations per source journal (horizontal bar)
     */
    function renderJournalRankingChart(chartData, container) {
        if (!container || typeof echarts === 'undefined' || !chartData) {
            if (container) container.innerHTML = '<div class="empty-state"><p>暂无数据。</p></div>';
            return;
        }
        if (currentJournalRankingChart) { currentJournalRankingChart.dispose(); currentJournalRankingChart = null; }

        const { heatmap_data, y_labels } = chartData;
        if (!heatmap_data || !y_labels || y_labels.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>暂无排行数据。</p></div>';
            return;
        }

        // Sum each row → total citations per source journal
        const totals = heatmap_data.map(row => row.reduce((s, v) => s + (v || 0), 0));
        const paired = y_labels.map((j, i) => ({ journal: j, total: totals[i] }));
        paired.sort((a, b) => a.total - b.total); // ascending so top is at top in horizontal bar

        const labels = paired.map(p => p.journal);
        const values = paired.map(p => p.total);
        const maxVal = Math.max(...values, 1);

        const dynamicH = Math.max(280, labels.length * 30 + 80);
        container.style.height = `${dynamicH}px`;

        setTimeout(() => {
        currentJournalRankingChart = echarts.init(container);
        currentJournalRankingChart.setOption({
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: p => `${p[0].name}<br/>引用总量：<strong>${p[0].value}</strong>`
            },
            grid: { left: '2%', right: '8%', top: '4%', bottom: '4%', containLabel: true },
            xAxis: {
                type: 'value',
                axisLabel: { color: '#8A9BB0', fontSize: 10 },
                splitLine: { lineStyle: { color: '#EEF2F7', type: 'dashed' } }
            },
            yAxis: {
                type: 'category',
                data: labels,
                axisLabel: {
                    color: '#4D5E70',
                    fontSize: 10,
                    width: 130,
                    overflow: 'truncate',
                    ellipsis: '…'
                },
                axisLine: { lineStyle: { color: '#E2E8F0' } }
            },
            series: [{
                type: 'bar',
                data: values.map((v, i) => ({
                    value: v,
                    itemStyle: {
                        color: {
                            type: 'linear',
                            x: 0, y: 0, x2: 1, y2: 0,
                            colorStops: [
                                { offset: 0, color: 'rgba(12,149,113,0.5)' },
                                { offset: 1, color: `rgba(12,149,113,${0.5 + (v / maxVal) * 0.5})` }
                            ]
                        },
                        borderRadius: [0, 4, 4, 0]
                    }
                })),
                label: {
                    show: true,
                    position: 'right',
                    color: '#4D5E70',
                    fontSize: 10,
                    formatter: p => p.value > 0 ? p.value : ''
                },
                barMaxWidth: 22
            }]
        });
        }, 0);
    }

    /**
     * Chart D (Feature 4): Article Citation Source — Donut chart (in modal)
     * Shows breakdown: C刊 / C扩 / 集刊 / other
     */
    function renderCitationDonutChart(stats, container) {
        if (!container || typeof echarts === 'undefined' || !stats) return;
        if (currentDonutChart) { currentDonutChart.dispose(); currentDonutChart = null; }

        const rawData = [
            { name: '外语C刊', value: stats['外语C刊'] || 0, color: '#0C9571' },
            { name: '外语C扩', value: stats['外语核心期刊'] || 0, color: '#3B82F6' },
            { name: '外语集刊', value: stats['外语C集刊'] || 0, color: '#F59E0B' },
        ];
        const known = rawData.reduce((s, d) => s + d.value, 0);
        const total = stats.total || 0;
        const other = Math.max(0, total - known);
        if (other > 0) rawData.push({ name: '其他来源', value: other, color: '#CBD5E1' });

        const filteredData = rawData.filter(d => d.value > 0);
        if (filteredData.length === 0 || total === 0) {
            container.innerHTML = '<div class="empty-state" style="padding:1rem;"><p>暂无足够数据生成分布图。</p></div>';
            return;
        }

        const isNarrow = container.clientWidth < 740;
        const donutCenterX = isNarrow ? '50%' : '34%';
        const legendConfig = isNarrow
            ? { orient: 'horizontal', left: 'center', bottom: 6, top: 'auto' }
            : { orient: 'vertical', right: '5%', top: 'middle' };

        currentDonutChart = echarts.init(container);
        currentDonutChart.setOption({
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'item',
                formatter: p => `${p.name}<br/>次数：<strong>${p.value}</strong>（${p.percent}%）`
            },
            legend: {
                ...legendConfig,
                textStyle: { color: '#4D5E70', fontSize: 11 },
                itemWidth: 10, itemHeight: 10
            },
            series: [{
                type: 'pie',
                radius: ['42%', '68%'],
                center: [donutCenterX, isNarrow ? '46%' : '50%'],
                avoidLabelOverlap: true,
                data: filteredData.map(d => ({
                    value: d.value,
                    name: d.name,
                    itemStyle: { color: d.color }
                })),
                label: {
                    show: true,
                    formatter: p => `${p.percent.toFixed(0)}%`,
                    color: '#4D5E70',
                    fontSize: 11,
                    fontWeight: 700
                },
                emphasis: {
                    itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.15)' }
                }
            }],
            graphic: [{
                type: 'text',
                left: donutCenterX,
                top: isNarrow ? '46%' : '50%',
                style: {
                    text: `${total}\n总被引`,
                    textAlign: 'center',
                    fill: '#0D1B2A',
                    fontSize: 13,
                    fontWeight: 700,
                    lineHeight: 18
                }
            }]
        });
    }

    // ─────────────────────────────────────────────────────────────
    //  功能 3: 查作者关系 — Force-directed network graph
    // ─────────────────────────────────────────────────────────────

    /**
     * Renders the stats strip above the network graph.
     */
    function renderNetworkStats(stats, authorName, nodes = [], startYear = null, endYear = null) {
        if (!authorNetworkStats) return;
        const toNumber = v => {
            const n = Number(v);
            return Number.isFinite(n) ? n : 0;
        };
        const pickTopNames = (category, limit) => nodes
            .filter(n => n?.category === category && n?.name)
            .sort((a, b) => (toNumber(b.value) - toNumber(a.value)) || (toNumber(b.symbolSize) - toNumber(a.symbolSize)))
            .slice(0, limit)
            .map(n => escapeHTML(n.name));
        const featuredNames = [...new Set([
            ...pickTopNames(1, 4),
            ...pickTopNames(2, 3),
            ...pickTopNames(3, 3),
        ])];
        const yearsText = (startYear && endYear) ? `${escapeHTML(startYear)} - ${escapeHTML(endYear)}` : '关系总览';

        const items = [
            { icon: '📄', label: '检索到文章', value: stats.total_articles },
            { icon: '🤝', label: '合著关系', value: stats.coauthors },
            { icon: '↗️', label: '引出关系（我引用）', value: stats.cited_out },
            { icon: '↙️', label: '引入关系（引用我）', value: stats.citing_in },
        ];
        authorNetworkStats.innerHTML = `
            <div class="network-stats-bar">
                <div class="network-stats-author">
                    <span class="network-center-dot"></span>
                    <div class="network-title-block">
                        <strong class="network-title-main">核心作者：${escapeHTML(authorName)}</strong>
                        <span class="network-title-meta">时间范围：${yearsText}</span>
                    </div>
                </div>
                <div class="network-stats-items">
                    ${items.map(it => `
                        <div class="network-stat-item">
                            <span class="network-stat-icon">${it.icon}</span>
                            <div>
                                <div class="network-stat-value">${it.value}</div>
                                <div class="network-stat-label">${it.label}</div>
                            </div>
                        </div>`).join('')}
                </div>
            </div>
            <div class="network-name-ribbon">
                <span class="network-name-label">图中重点作者</span>
                ${featuredNames.length
                    ? featuredNames.map(name => `<span class="network-name-chip">${name}</span>`).join('')
                    : '<span class="network-empty-names">暂无可展示的关系作者姓名</span>'}
            </div>
            <div class="network-legend">
                <button type="button" class="legend-item network-legend-item" data-category="0" aria-pressed="true"><span class="legend-dot" style="background:#0C9571;"></span>查询作者</button>
                <button type="button" class="legend-item network-legend-item" data-category="1" aria-pressed="true"><span class="legend-dot" style="background:#3B82F6;"></span>合著关系</button>
                <button type="button" class="legend-item network-legend-item" data-category="2" aria-pressed="true"><span class="legend-dot" style="background:#F59E0B;"></span>引出（我引用）</button>
                <button type="button" class="legend-item network-legend-item" data-category="3" aria-pressed="true"><span class="legend-dot" style="background:#8B5CF6;"></span>引入（引用我）</button>
            </div>`;
    }

    function bindNetworkLegendInteractions() {
        if (!authorNetworkStats) return;

        const legendButtons = authorNetworkStats.querySelectorAll('.network-legend-item');
        legendButtons.forEach(btn => {
            const category = Number(btn.dataset.category);
            const isHidden = networkHiddenCategories.has(category);
            btn.classList.toggle('is-muted', isHidden);
            btn.setAttribute('aria-pressed', String(!isHidden));

            btn.onclick = () => {
                const currentlyHidden = networkHiddenCategories.has(category);
                const totalCategories = legendButtons.length;
                const visibleCount = totalCategories - networkHiddenCategories.size;

                // Keep at least one visible category to avoid empty chart.
                if (!currentlyHidden && visibleCount <= 1) return;

                if (currentlyHidden) {
                    networkHiddenCategories.delete(category);
                } else {
                    networkHiddenCategories.add(category);
                }

                legendButtons.forEach(innerBtn => {
                    const innerCategory = Number(innerBtn.dataset.category);
                    const hidden = networkHiddenCategories.has(innerCategory);
                    innerBtn.classList.toggle('is-muted', hidden);
                    innerBtn.setAttribute('aria-pressed', String(!hidden));
                });

                applyNetworkCategoryFilter();
            };
        });
    }

    function applyNetworkCategoryFilter() {
        if (!currentNetworkChart || !currentNetworkChart.__rawNetworkData) return;

        const rawData = currentNetworkChart.__rawNetworkData;
        const visibleNodes = rawData.nodes.filter(node => !networkHiddenCategories.has(node.category));
        const visibleNodeIds = new Set(visibleNodes.map(node => String(node.id)));
        const visibleLinks = rawData.links.filter(link => (
            visibleNodeIds.has(String(link.source)) && visibleNodeIds.has(String(link.target))
        ));

        const scaleBoost = 1 + (networkHiddenCategories.size * 0.12);
        const scaledNodes = visibleNodes.map(node => ({
            ...node,
            symbolSize: Math.min(66, Math.max(14, Math.round(node.symbolSize * scaleBoost))),
        }));

        const repulsion = visibleNodes.length <= 20 ? 510 : 420;
        const edgeLength = visibleNodes.length <= 20 ? [110, 210] : [90, 230];

        currentNetworkChart.setOption({
            series: [{
                data: scaledNodes,
                links: visibleLinks,
                force: {
                    repulsion,
                    edgeLength,
                    gravity: 0.05,
                    friction: 0.18,
                    layoutAnimation: true,
                }
            }]
        });
    }

    /**
     * Renders the ECharts force-directed graph.
     * Category colours: 0=center(green), 1=coauthor(blue), 2=cited-out(amber), 3=citing-in(violet)
     */
    function renderAuthorNetworkChart(graphData) {
        const container = document.getElementById('author-network-chart');
        if (!container || typeof echarts === 'undefined') return;
        if (currentNetworkChart) { currentNetworkChart.dispose(); currentNetworkChart = null; }

        const CATEGORY_COLORS = ['#0C9571', '#3B82F6', '#F59E0B', '#8B5CF6'];
        const CATEGORY_NAMES  = ['查询作者', '合著关系', '引出（我引用）', '引入（引用我）'];
        const toNumber = v => {
            const n = Number(v);
            return Number.isFinite(n) ? n : 0;
        };
        const nodeMap = new Map((graphData.nodes || []).map(n => [String(n.id), n]));
        const weightedDegree = new Map();
        (graphData.links || []).forEach(link => {
            const sourceId = String(link.source);
            const targetId = String(link.target);
            const weight = Math.max(1, toNumber(link.value) || 1);
            weightedDegree.set(sourceId, (weightedDegree.get(sourceId) || 0) + weight);
            weightedDegree.set(targetId, (weightedDegree.get(targetId) || 0) + weight);
        });

        const featuredNodeIds = new Set();
        const centerNode = (graphData.nodes || []).find(n => n.category === 0);
        if (centerNode?.id != null) featuredNodeIds.add(String(centerNode.id));

        const pinTopNodes = (category, limit) => {
            (graphData.nodes || [])
                .filter(n => n.category === category)
                .sort((a, b) => {
                    const scoreA = toNumber(a.value) + (weightedDegree.get(String(a.id)) || 0);
                    const scoreB = toNumber(b.value) + (weightedDegree.get(String(b.id)) || 0);
                    return scoreB - scoreA;
                })
                .slice(0, limit)
                .forEach(n => featuredNodeIds.add(String(n.id)));
        };

        pinTopNodes(1, 8);
        pinTopNodes(2, 5);
        pinTopNodes(3, 5);

        const formatNodeLabel = (name) => {
            const text = String(name || '');
            return text.length > 10 ? `${text.slice(0, 10)}…` : text;
        };

        const getLinkCategoryColor = (link) => {
            const sourceNode = nodeMap.get(String(link.source));
            const targetNode = nodeMap.get(String(link.target));
            if (sourceNode?.category === 0 && targetNode?.category === 1) return CATEGORY_COLORS[1];
            if (sourceNode?.category === 0 && targetNode?.category === 2) return CATEGORY_COLORS[2];
            if (targetNode?.category === 0 && sourceNode?.category === 3) return CATEGORY_COLORS[3];
            return '#9DB1C7';
        };

        const getLinkRelationName = (link) => {
            const sourceNode = nodeMap.get(String(link.source));
            const targetNode = nodeMap.get(String(link.target));
            if (sourceNode?.category === 0 && targetNode?.category === 1) return '合著关系';
            if (sourceNode?.category === 0 && targetNode?.category === 2) return '引出关系（我引用）';
            if (targetNode?.category === 0 && sourceNode?.category === 3) return '引入关系（引用我）';
            return '学术关联';
        };

        const preparedNodes = (graphData.nodes || []).map(node => {
            const nodeSize = node.category === 0
                ? 54
                : Math.max(14, Math.min(38, toNumber(node.symbolSize) + 2));
            const shouldShowLabel = node.category === 0
                || featuredNodeIds.has(String(node.id))
                || nodeSize >= 22;
            const nodeColor = CATEGORY_COLORS[node.category] ?? '#8A9BB0';

            return {
                ...node,
                symbolSize: nodeSize,
                itemStyle: {
                    color: nodeColor,
                    borderColor: node.category === 0 ? '#FFFFFF' : 'rgba(255,255,255,0.9)',
                    borderWidth: node.category === 0 ? 2.5 : 1.2,
                    shadowBlur: node.category === 0 ? 18 : 8,
                    shadowColor: node.category === 0 ? 'rgba(12,149,113,0.30)' : 'rgba(13,27,42,0.12)',
                },
                label: {
                    show: shouldShowLabel,
                    position: 'right',
                    distance: 4,
                    formatter: p => formatNodeLabel(p.data.name),
                    fontSize: node.category === 0 ? 14 : 11,
                    color: '#0D1B2A',
                    fontWeight: node.category === 0 ? 700 : 600,
                    backgroundColor: 'rgba(255,255,255,0.76)',
                    borderRadius: 6,
                    padding: [2, 5],
                }
            };
        });

        const preparedLinks = (graphData.links || []).map(link => {
            const linkWeight = Math.max(1, toNumber(link.value) || 1);
            return {
                ...link,
                lineStyle: {
                    ...(link.lineStyle || {}),
                    color: getLinkCategoryColor(link),
                    curveness: 0.18,
                    opacity: 0.56,
                    width: Math.min(1 + linkWeight * 0.35, 5.2),
                },
                label: {
                    show: false,
                }
            };
        });

        setTimeout(() => {
            currentNetworkChart = echarts.init(container);
            currentNetworkChart.setOption({
                backgroundColor: 'transparent',
                tooltip: {
                    trigger: 'item',
                    formatter: p => {
                        if (p.dataType === 'edge') {
                            return `${escapeHTML(p.data.source)} → ${escapeHTML(p.data.target)}<br/>关系类型：${getLinkRelationName(p.data)}`;
                        }
                        const cat = CATEGORY_NAMES[p.data.category] || '关系节点';
                        return `<strong>${escapeHTML(p.data.name)}</strong><br/>类型：${cat}`;
                    }
                },
                series: [{
                    type: 'graph',
                    layout: 'force',
                    data: preparedNodes,
                    links: preparedLinks,
                    categories: CATEGORY_NAMES.map((name, i) => ({
                        name,
                        itemStyle: { color: CATEGORY_COLORS[i] }
                    })),
                    roam: true,
                    draggable: true,
                    nodeScaleRatio: 0.74,
                    force: {
                        repulsion: 420,
                        edgeLength: [90, 230],
                        gravity: 0.05,
                        friction: 0.18,
                        layoutAnimation: true,
                    },
                    labelLayout: {
                        hideOverlap: true,
                        moveOverlap: 'shiftY'
                    },
                    emphasis: {
                        focus: 'adjacency',
                        lineStyle: { width: 3.5, opacity: 0.96 },
                        label: { show: true }
                    },
                    animationDurationUpdate: 520,
                    animationEasingUpdate: 'quarticOut',
                    edgeSymbol: ['none', 'arrow'],
                    edgeSymbolSize: [0, 8],
                }]
            });
            currentNetworkChart.__rawNetworkData = {
                nodes: preparedNodes,
                links: preparedLinks
            };
            applyNetworkCategoryFilter();
        }, 0);
    }

    // --- Chart Resize Handler for Mobile/Responsive ---
    function handleResize() {
        if (currentSankeyChart) currentSankeyChart.resize();
        if (currentChordChart) currentChordChart.resize();
        if (currentBubbleChart) currentBubbleChart.resize();
        if (currentCitingBarChart) currentCitingBarChart.resize();
        if (currentJournalRankingChart) currentJournalRankingChart.resize();
        if (currentDonutChart) currentDonutChart.resize();
        if (currentNetworkChart) currentNetworkChart.resize();
    }

    window.addEventListener('resize', handleResize);

    // ─────────────────────────────────────────────────────────────
    //  HISTORY FEATURE
    // ─────────────────────────────────────────────────────────────
    const HISTORY_KEY = 'ylyc_search_history';
    const MAX_HISTORY = 50;

    const historyPanel   = document.getElementById('historyPanel');
    const historyOverlay = document.getElementById('historyOverlay');
    const historyList    = document.getElementById('historyList');
    const historyBadge   = document.getElementById('historyBadge');
    const historyToggle  = document.getElementById('historyToggleBtn');
    const historyClose   = document.getElementById('historyCloseBtn');
    const historyClear   = document.getElementById('historyClearBtn');

    // ── History: type config ─────────────────────────────────────
    const HISTORY_TYPES = {
        '查作者信息': { color: '#3B82F6', tab: 'author-info-pane',     icon: '👤' },
        '查作者引用': { color: '#0C9571', tab: 'author-citing-pane',   icon: '🔗' },
        '查作者关系': { color: '#EC4899', tab: 'author-network-pane',  icon: '🕸️' },
        '查期刊互引': { color: '#8B5CF6', tab: 'journal-pane',          icon: '📚' },
        '查文章被引': { color: '#F59E0B', tab: 'cited-by-pane',         icon: '📄' },
    };

    let historyActiveFilter = '全部'; // current type filter

    function loadHistory() {
        try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
        catch(e) { return []; }
    }

    function saveHistory(type, label, count, params) {
        const records = loadHistory();
        records.unshift({
            id: Date.now(),
            timestamp: new Date().toISOString(),
            type,
            label,
            count: count ?? null,
            params: params || null,   // structured params for replay
        });
        localStorage.setItem(HISTORY_KEY, JSON.stringify(records.slice(0, MAX_HISTORY)));
        renderHistoryPanel();
    }

    function formatTimestamp(iso) {
        try {
            const d = new Date(iso);
            const pad = n => String(n).padStart(2, '0');
            const now = new Date();
            const sameDay = d.toDateString() === now.toDateString();
            const yesterday = new Date(now); yesterday.setDate(now.getDate()-1);
            const isYesterday = d.toDateString() === yesterday.toDateString();
            const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
            if (sameDay) return `今天 ${timeStr}`;
            if (isYesterday) return `昨天 ${timeStr}`;
            return `${d.getMonth()+1}月${d.getDate()}日 ${timeStr}`;
        } catch(e) { return iso; }
    }

    function getDateGroup(iso) {
        try {
            const d = new Date(iso);
            const now = new Date();
            const yesterday = new Date(now); yesterday.setDate(now.getDate()-1);
            if (d.toDateString() === now.toDateString()) return '今天';
            if (d.toDateString() === yesterday.toDateString()) return '昨天';
            return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
        } catch(e) { return '历史'; }
    }

    /** Fill form fields and click search button to replay a history record */
    function replayHistory(record) {
        if (!record.params) return;
        const cfg = HISTORY_TYPES[record.type];
        // Switch to the correct tab
        tabButtons.forEach(btn => {
            if (btn.dataset.target === cfg?.tab) {
                btn.click();
            }
        });
        closeHistoryPanel();

        // Fill form fields based on type
        setTimeout(() => {
            const p = record.params;
            try {
                if (record.type === '查作者信息') {
                    const el = document.getElementById('author-search-query');
                    if (el) { el.value = p.name; }
                    document.getElementById('find-author-btn')?.click();

                } else if (record.type === '查作者引用') {
                    const ca = document.getElementById('citing-author-name');
                    const tj = document.getElementById('author-citing-target-journal');
                    const sy = document.getElementById('author-citing-start-year');
                    const ey = document.getElementById('author-citing-end-year');
                    if (ca) ca.value = p.citing_author || '';
                    if (tj) tj.value = p.target_journals || '';
                    if (sy) sy.value = p.start_year || '';
                    if (ey) ey.value = p.end_year || '';
                    document.getElementById('search-author-citing-btn')?.click();

                } else if (record.type === '查作者关系') {
                    const na = document.getElementById('network-author-name');
                    const sy = document.getElementById('network-start-year');
                    const ey = document.getElementById('network-end-year');
                    if (na) na.value = p.author_name || '';
                    if (sy) sy.value = p.start_year || '';
                    if (ey) ey.value = p.end_year || '';
                    document.getElementById('search-author-network-btn')?.click();

                } else if (record.type === '查期刊互引') {
                    const sj = document.getElementById('source-journals');
                    const tj = document.getElementById('journal-target-journal');
                    const sy = document.getElementById('journal-start-year');
                    const ey = document.getElementById('journal-end-year');
                    if (sj) sj.value = p.source_journals || '';
                    if (tj) tj.value = p.target_journals || '';
                    if (sy) sy.value = p.start_year || '';
                    if (ey) ey.value = p.end_year || '';
                    document.getElementById('search-journal-citations-btn')?.click();

                } else if (record.type === '查文章被引') {
                    const el = document.getElementById('article-identifier');
                    if (el) el.value = p.identifier || '';
                    document.getElementById('find-article-btn')?.click();
                }
            } catch(e) { console.warn('History replay error:', e); }
        }, 80);
    }

    function renderHistoryPanel() {
        const allRecords = loadHistory();

        // Update badge
        if (historyBadge) {
            if (allRecords.length > 0) {
                historyBadge.textContent = allRecords.length > 99 ? '99+' : allRecords.length;
                historyBadge.style.display = 'inline-flex';
            } else {
                historyBadge.style.display = 'none';
            }
        }

        if (!historyList) return;
        if (allRecords.length === 0) {
            historyList.innerHTML = '<div class="history-empty"><div style="font-size:2rem;margin-bottom:.5rem;">🔍</div>暂无检索记录</div>';
            return;
        }

        // ── Stats summary ──────────────────────────────────
        const typeCounts = {};
        allRecords.forEach(r => { typeCounts[r.type] = (typeCounts[r.type] || 0) + 1; });
        const statsHTML = `
            <div class="history-stats-header">
                <div class="history-stats-total">共 <strong>${allRecords.length}</strong> 条检索记录</div>
                <div class="history-stats-bars">
                    ${Object.entries(typeCounts).map(([type, cnt]) => {
                        const cfg = HISTORY_TYPES[type] || {};
                        const pct = Math.round((cnt / allRecords.length) * 100);
                        return `<div class="history-stats-bar-item" title="${type}: ${cnt}条">
                            <span class="history-stats-bar-label">${cfg.icon || ''} ${type}</span>
                            <div class="history-stats-bar-track">
                                <div class="history-stats-bar-fill" style="width:${pct}%;background:${cfg.color};"></div>
                            </div>
                            <span class="history-stats-bar-count">${cnt}</span>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;

        // ── Filter tabs ────────────────────────────────────
        const filterTypes = ['全部', ...Object.keys(typeCounts)];
        const filterHTML = `
            <div class="history-filter-tabs">
                ${filterTypes.map(t =>
                    `<button class="history-filter-tab ${historyActiveFilter === t ? 'active' : ''}" data-filter="${t}">
                        ${t === '全部' ? t : (HISTORY_TYPES[t]?.icon + ' ' + t)}
                    </button>`
                ).join('')}
            </div>`;

        // ── Records (filtered, grouped by date) ──────────
        const filtered = historyActiveFilter === '全部'
            ? allRecords
            : allRecords.filter(r => r.type === historyActiveFilter);

        // Group by date
        const groups = {};
        filtered.forEach(r => {
            const grp = getDateGroup(r.timestamp);
            if (!groups[grp]) groups[grp] = [];
            groups[grp].push(r);
        });

        const recordsHTML = Object.entries(groups).map(([group, items]) => `
            <div class="history-date-group">
                <div class="history-date-label">${group}</div>
                ${items.map(r => {
                    const cfg = HISTORY_TYPES[r.type] || { color: '#8A9BB0', icon: '🔍' };
                    const canReplay = !!r.params;
                    const countBadge = r.count !== null
                        ? `<span class="history-result-badge">${r.count} 条</span>`
                        : '';
                    return `<div class="history-item" data-id="${r.id}">
                        <div class="history-item-top">
                            <span class="history-type-badge" style="background:${cfg.color}18;color:${cfg.color};">${cfg.icon} ${r.type}</span>
                            <span class="history-time">${formatTimestamp(r.timestamp)}</span>
                        </div>
                        <div class="history-item-label">${r.label}</div>
                        <div class="history-item-bottom">
                            ${countBadge}
                            <div class="history-item-actions">
                                <button class="history-btn-copy" data-copy="${encodeURIComponent(r.label)}" title="复制检索内容">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                    复制
                                </button>
                                ${canReplay ? `<button class="history-btn-replay" data-id="${r.id}" title="重新检索">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                                    重新查询
                                </button>` : ''}
                            </div>
                        </div>
                    </div>`;
                }).join('')}
            </div>`).join('');

        historyList.innerHTML = statsHTML + filterHTML + (filtered.length === 0
            ? '<div class="history-empty" style="padding:1.5rem;">该类型暂无记录</div>'
            : recordsHTML);

        // Bind filter tab clicks
        historyList.querySelectorAll('.history-filter-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                historyActiveFilter = btn.dataset.filter;
                renderHistoryPanel();
            });
        });

        // Bind copy buttons
        historyList.querySelectorAll('.history-btn-copy').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const text = decodeURIComponent(btn.dataset.copy);
                navigator.clipboard?.writeText(text).then(() => {
                    btn.textContent = '已复制 ✓';
                    setTimeout(() => { btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> 复制`; }, 1500);
                }).catch(() => { alert(text); });
            });
        });

        // Bind replay buttons
        historyList.querySelectorAll('.history-btn-replay').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const rec = allRecords.find(r => String(r.id) === String(btn.dataset.id));
                if (rec) replayHistory(rec);
            });
        });
    }

    function openHistoryPanel() {
        if (!historyPanel) return;
        renderHistoryPanel();
        historyPanel.classList.add('open');
        if (historyOverlay) historyOverlay.classList.add('visible');
    }

    function closeHistoryPanel() {
        if (historyPanel) historyPanel.classList.remove('open');
        if (historyOverlay) historyOverlay.classList.remove('visible');
    }

    if (historyToggle)  historyToggle.addEventListener('click', openHistoryPanel);
    if (historyClose)   historyClose.addEventListener('click', closeHistoryPanel);
    if (historyOverlay) historyOverlay.addEventListener('click', closeHistoryPanel);
    if (historyClear) {
        historyClear.addEventListener('click', () => {
            if (!confirm('确定清空所有检索历史吗？')) return;
            localStorage.removeItem(HISTORY_KEY);
            historyActiveFilter = '全部';
            renderHistoryPanel();
        });
    }

    // Initialise badge count on page load
    renderHistoryPanel();

    // --- Initial Run ---
    (async () => {
        await loadJournalCatalog();
        initializeAllQuickAdd();
        initializeJournalPickers();
        activateTabFromURL();
    })();
});
