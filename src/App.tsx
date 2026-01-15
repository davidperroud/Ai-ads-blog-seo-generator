import React, { useState } from 'react';
import { FileText, TrendingUp, Settings, Download, Sparkles, Upload, Key, Monitor, Copy, Check, Zap } from 'lucide-react';

interface CsvData {
    headers: string[];
    data: any[];
}

interface Article {
    title: string;
    metaDescription: string;
    introduction: string;
    sections: Array<{ heading: string; content: string }>;
    conclusion: string;
    keywords: string[];
}

type Provider = 'anthropic' | 'xai' | 'lmstudio';

export default function BlogGenerator() {
    const [step, setStep] = useState(1);
    const [provider, setProvider] = useState<Provider>('anthropic');
    const [apiKey, setApiKey] = useState('');
    const [csvData, setCsvData] = useState<CsvData | null>(null);
    const [selectedTerms, setSelectedTerms] = useState<string[]>([]);
    const [searchTerms, setSearchTerms] = useState('');
    const [existingArticles, setExistingArticles] = useState('');
    const [guidelines, setGuidelines] = useState('');
    const [generatedArticle, setGeneratedArticle] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null); const [copyStatus, setCopyStatus] = useState<'idle' | 'success'>('idle');

    const ANTHROPIC_VERSION = "2023-06-01";
    const ANTHROPIC_MODEL = "claude-3-5-sonnet-20240620";
    const XAI_MODEL = "grok-beta";

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const text = await file.text();
        const lines = text.split('\n').filter(line => line.trim());
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

        const data = lines.slice(1).map(line => {
            const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
            const row: any = {};
            headers.forEach((header, index) => {
                row[header] = values[index] || '';
            });
            return row;
        });

        setCsvData({ headers, data });
    };

    const callAI = async (content: string, maxTokens: number = 2000) => {
        if (provider === 'anthropic') {
            return callAnthropic(content, maxTokens);
        } else if (provider === 'xai') {
            return callXAI(content, maxTokens);
        } else {
            return callLMStudio(content, maxTokens);
        }
    };

    const callAnthropic = async (content: string, maxTokens: number = 2000) => {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": ANTHROPIC_VERSION,
                "anthropic-dangerous-direct-browser-access": "true"
            },
            body: JSON.stringify({
                model: ANTHROPIC_MODEL,
                max_tokens: maxTokens,
                messages: [{ role: "user", content }]
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || "Anthropic API Error");
        }

        const data = await response.json();
        const text = data.content.map((i: any) => i.type === "text" ? i.text : "").join("\n");
        return parseJSONFromText(text);
    };

    const callLMStudio = async (content: string, maxTokens: number = 2000) => {
        try {
            const response = await fetch("http://localhost:1234/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    messages: [{ role: "user", content }],
                    temperature: 0.7,
                    max_tokens: maxTokens,
                    stream: false
                })
            });

            if (!response.ok) {
                throw new Error("Impossible de se connecter à LM Studio. Assurez-vous que le serveur local est activé sur le port 1234.");
            }

            const data = await response.json();
            const text = data.choices[0].message.content;
            return parseJSONFromText(text);
        } catch (err) {
            throw new Error("Erreur de connexion à LM Studio. Vérifiez que l'application est ouverte et que le serveur local est lancé.");
        }
    };

    const callXAI = async (content: string, maxTokens: number = 2000) => {
        const response = await fetch("https://api.x.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: XAI_MODEL,
                messages: [{ role: "user", content }],
                temperature: 0,
                max_tokens: maxTokens
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || "xAI API Error");
        }

        const data = await response.json();
        const text = data.choices[0].message.content;
        return parseJSONFromText(text);
    };

    const parseJSONFromText = (text: string) => {
        const clean = text.replace(/```json|```/g, "").trim();
        // Find the first { and last } to handle cases where AI adds extra text
        const start = clean.indexOf('{');
        const end = clean.lastIndexOf('}');
        if (start === -1 || end === -1) {
            throw new Error("L'IA n'a pas renvoyé un format JSON valide.");
        }
        return JSON.parse(clean.substring(start, end + 1));
    };

    const analyzeBestTerms = async () => {
        if (!csvData) return;
        if ((provider === 'anthropic' || provider === 'xai') && !apiKey) return;

        setIsAnalyzing(true);

        try {
            const prompt = `Analyse ce fichier CSV de termes de recherche Google Ads et sélectionne les 10 à 18 meilleurs termes pour créer un article de blog.

COLONNES DISPONIBLES : ${csvData.headers.join(', ')}

DONNÉES (premiers 50 termes) :
${JSON.stringify(csvData.data.slice(0, 50), null, 2)}

Critères de sélection :
- Volume de recherche élevé
- Taux de conversion ou performance
- Pertinence thématique (regroupe par thème)
- Potentiel SEO
- Intention de recherche informationnelle (pas transactionnelle)

Réponds UNIQUEMENT avec un objet JSON :
{
  "selectedTerms": ["terme 1", "terme 2", ...],
  "reasoning": "explication brève de la sélection",
  "suggestedTheme": "thème principal identifié"
}

Sélectionne entre 10 et 18 termes.`;

            const result = await callAI(prompt);
            setSelectedTerms(result.selectedTerms);
            setSearchTerms(result.selectedTerms.join('\n'));
            setStep(1.5);
        } catch (error: any) {
            console.error("Erreur:", error);
            alert(`Erreur: ${error.message}`);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const generateArticle = async () => {
        if ((provider === 'anthropic' || provider === 'xai') && !apiKey) return;
        setIsGenerating(true);

        try {
            const stylePrompt = `Analyse le style d'écriture de ces articles et décris-le de manière concise (ton, structure, longueur des phrases, vocabulaire, format) :

${existingArticles}

Réponds UNIQUEMENT avec un objet JSON :
{"style": "description du style", "tone": "ton utilisé", "structure": "structure typique"}`;

            const styleAnalysis = await callAI(stylePrompt, 1000);

            const articlePrompt = `Tu es un rédacteur web expert. Crée un article de blog optimisé SEO.

TERMES DE RECHERCHE GOOGLE ADS PERFORMANTS :
${searchTerms}

STYLE À REPRODUIRE :
${JSON.stringify(styleAnalysis, null, 2)}

DIRECTIVES :
${guidelines}

Génère un article complet en suivant ce format JSON :
{
  "title": "titre accrocheur avec mot-clé principal",
  "metaDescription": "description SEO 150-160 caractères",
  "introduction": "paragraphe d'introduction",
  "sections": [
    {
      "heading": "titre de section",
      "content": "contenu détaillé"
    }
  ],
  "conclusion": "paragraphe de conclusion",
  "keywords": ["mots-clés", "identifiés"]
}

Réponds UNIQUEMENT avec le JSON, sans texte avant ou après.`;

            const article = await callAI(articlePrompt, 4000) as Article;

            const formatted = `# ${article.title}

**Meta Description :** ${article.metaDescription}

---

${article.introduction}

${article.sections.map(section => `## ${section.heading}

${section.content}`).join('\n\n')}

## Conclusion

${article.conclusion}

---

**Mots-clés :** ${article.keywords.join(', ')}`;

            setGeneratedArticle(formatted);
            setStep(5);

            // Generate download URL for fallback
            const blob = new Blob([formatted], { type: 'text/markdown' });
            setDownloadUrl(URL.createObjectURL(blob));

        } catch (error: any) {
            console.error("Erreur:", error);
            alert(`Erreur: ${error.message}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const copyToClipboard = async () => { try { await navigator.clipboard.writeText(generatedArticle); setCopyStatus('success'); setTimeout(() => setCopyStatus('idle'), 2000); } catch (err) { console.error('Failed to copy text: ', err); } }; const downloadArticle = () => {
        if (!generatedArticle) return;
        const blob = new Blob([generatedArticle], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'article-blog.md';
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    };

    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8">
            <div className="max-w-4xl mx-auto">
                <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
                    {/* Header */}
                    <div className="bg-indigo-600 p-8 text-white relative overflow-hidden">
                        <div className="relative z-10">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="bg-white/20 p-2 rounded-lg">
                                    <Sparkles size={32} />
                                </div>
                                <h1 className="text-3xl font-bold tracking-tight">Blog Generator IA</h1>
                            </div>
                            <p className="text-indigo-100 text-lg">Générez des articles optimisés SEO localement ou via le cloud.</p>
                        </div>
                        <div className="absolute top-0 right-0 p-8 opacity-10">
                            <Monitor size={150} />
                        </div>
                    </div>

                    <div className="p-8">
                        {/* Steps Indicator */}
                        <div className="flex items-center justify-between mb-12">
                            {[1, 1.5, 2, 3, 4, 5].map((s, idx) => (
                                <div key={s} className="flex items-center flex-1 last:flex-none">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${step >= s ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400'
                                        }`}>
                                        {s === 1.5 ? '✓' : s === 5 ? '★' : Math.floor(s)}
                                    </div>
                                    {idx < 5 && (
                                        <div className={`flex-1 h-1 mx-2 rounded ${step > s ? 'bg-indigo-600' : 'bg-slate-100'
                                            }`} />
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Step 1: Config & Upload */}
                        {step === 1 && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

                                {/* Provider Selection */}
                                <div className="space-y-4">
                                    <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
                                        <Monitor className="text-indigo-600" size={24} />
                                        1. Choisir l'Intelligence Artificielle
                                    </h2>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <button
                                            onClick={() => setProvider('anthropic')}
                                            className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${provider === 'anthropic'
                                                ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                                : 'border-slate-100 hover:border-slate-200 text-slate-500'
                                                }`}
                                        >
                                            <Sparkles size={24} />
                                            <span className="font-bold">Anthropic Claude</span>
                                            <span className="text-xs text-center">Cloud - Haute qualité</span>
                                        </button>
                                        <button
                                            onClick={() => setProvider('xai')}
                                            className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${provider === 'xai'
                                                ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                                : 'border-slate-100 hover:border-slate-200 text-slate-500'
                                                }`}
                                        >
                                            <Zap size={24} />
                                            <span className="font-bold">xAI Grok</span>
                                            <span className="text-xs text-center">Cloud - Rapide & Puissant</span>
                                        </button>
                                        <button
                                            onClick={() => setProvider('lmstudio')}
                                            className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${provider === 'lmstudio'
                                                ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                                : 'border-slate-100 hover:border-slate-200 text-slate-500'
                                                }`}
                                        >
                                            <Monitor size={24} />
                                            <span className="font-bold">LM Studio</span>
                                            <span className="text-xs text-center">Local - Gratuit & Privé</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* API Key (Only show if Anthropic) */}
                                    <div className={`space-y-4 transition-all ${(provider === 'anthropic' || provider === 'xai') ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                                        <div className="flex items-center gap-2 text-slate-800">
                                            <Key className="text-indigo-600" size={24} />
                                            <h2 className="text-xl font-semibold">2. Clé API {provider === 'xai' ? 'xAI' : 'Anthropic'}</h2>
                                        </div>
                                        <input
                                            type="password"
                                            placeholder={provider === 'anthropic' ? "sk-ant-..." : provider === 'xai' ? "xai-..." : "Non requis en mode local"}
                                            disabled={provider === 'lmstudio'}
                                            className="w-full p-4 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
                                            value={apiKey}
                                            onChange={(e) => setApiKey(e.target.value)}
                                        />
                                        <p className="text-xs text-slate-500">
                                            Utilisée uniquement pour les appels API {provider === 'xai' ? 'xAI Grok' : 'Claude'}.
                                        </p>
                                    </div>

                                    {/* CSV Upload */}
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-2 text-slate-800">
                                            <Upload className="text-indigo-600" size={24} />
                                            <h2 className="text-xl font-semibold">3. Données Google Ads</h2>
                                        </div>
                                        <div className="relative border-2 border-dashed border-slate-200 rounded-xl p-8 hover:border-indigo-400 transition-colors group">
                                            <input
                                                type="file"
                                                accept=".csv"
                                                onChange={handleFileUpload}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            />
                                            <div className="text-center">
                                                <Upload className="mx-auto text-slate-400 group-hover:text-indigo-500 mb-2 transition-colors" size={32} />
                                                <span className="block text-slate-600 font-medium">Charger le CSV des termes</span>
                                                <span className="text-xs text-slate-400">Export Google Ads .csv</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {csvData && (
                                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-center gap-3">
                                        <div className="bg-emerald-500 text-white p-1 rounded-full">
                                            <Sparkles size={16} />
                                        </div>
                                        <div>
                                            <p className="text-emerald-900 font-semibold text-sm">Fichier prêt ({csvData.data.length} termes)</p>
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={analyzeBestTerms}
                                    disabled={!csvData || (provider === 'anthropic' && !apiKey) || isAnalyzing}
                                    className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-3"
                                >
                                    {isAnalyzing ? (
                                        <>
                                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                                            Analyse en cours...
                                        </>
                                    ) : (
                                        <>
                                            <TrendingUp size={24} />
                                            Analyser les meilleurs termes
                                        </>
                                    )}
                                </button>
                            </div>
                        )}

                        {/* Step 1.5: Suggested Terms */}
                        {step === 1.5 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                                <div className="flex items-center gap-2 mb-4">
                                    <Sparkles className="text-indigo-600" size={24} />
                                    <h2 className="text-2xl font-bold text-slate-800">Sélection stratégique</h2>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    {selectedTerms.map((term, index) => (
                                        <div key={index} className="bg-indigo-50 border border-indigo-100 p-3 rounded-lg text-indigo-900 text-sm font-medium flex items-center gap-2">
                                            <span className="bg-indigo-200 text-indigo-700 w-5 h-5 rounded-full flex items-center justify-center text-[10px]">{index + 1}</span>
                                            {term}
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-4 pt-4">
                                    <button onClick={() => setStep(1)} className="flex-1 py-4 font-semibold text-slate-600 hover:bg-slate-50 transition-colors rounded-xl border border-slate-200">Retour</button>
                                    <button onClick={() => setStep(2)} className="flex-1 py-4 font-semibold bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all">Continuer</button>
                                </div>
                            </div>
                        )}

                        {/* Step 2: Refine Terms */}
                        {step === 2 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                                <div className="flex items-center gap-2 mb-4">
                                    <TrendingUp className="text-indigo-600" size={24} />
                                    <h2 className="text-2xl font-bold text-slate-800">Valider les mots-clés</h2>
                                </div>
                                <textarea
                                    className="w-full h-64 p-6 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 transition-all bg-slate-50 font-mono text-sm shadow-inner"
                                    value={searchTerms}
                                    onChange={(e) => setSearchTerms(e.target.value)}
                                    placeholder="Un mot-clé par ligne..."
                                />
                                <div className="flex gap-4">
                                    <button onClick={() => setStep(1.5)} className="flex-1 py-4 font-semibold text-slate-600 hover:bg-slate-50 transition-colors rounded-xl border border-slate-200">Retour</button>
                                    <button onClick={() => setStep(3)} className="flex-1 py-4 font-semibold bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all">Suivant</button>
                                </div>
                            </div>
                        )}

                        {/* Step 3: Style learning */}
                        {step === 3 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                                <div className="flex items-center gap-2 mb-4">
                                    <FileText className="text-indigo-600" size={24} />
                                    <h2 className="text-2xl font-bold text-slate-800">Apprentissage du style</h2>
                                </div>
                                <p className="text-slate-600">L'IA apprendra à rédiger comme vous.</p>
                                <textarea
                                    className="w-full h-80 p-6 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 transition-all shadow-inner"
                                    value={existingArticles}
                                    onChange={(e) => setExistingArticles(e.target.value)}
                                    placeholder="Collez 2 ou 3 articles ici..."
                                />
                                <div className="flex gap-4">
                                    <button onClick={() => setStep(2)} className="flex-1 py-4 font-semibold text-slate-600 hover:bg-slate-50 transition-colors rounded-xl border border-slate-200">Retour</button>
                                    <button onClick={() => setStep(4)} className="flex-1 py-4 font-semibold bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all">Suivant</button>
                                </div>
                            </div>
                        )}

                        {/* Step 4: Guidelines */}
                        {step === 4 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                                <div className="flex items-center gap-2 mb-4">
                                    <Settings className="text-indigo-600" size={24} />
                                    <h2 className="text-2xl font-bold text-slate-800">Directives de rédaction</h2>
                                </div>
                                <textarea
                                    className="w-full h-64 p-6 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 transition-all shadow-inner"
                                    value={guidelines}
                                    onChange={(e) => setGuidelines(e.target.value)}
                                    placeholder="Ex: Longueur 1200 mots, Ton professionnel, Ajouter des FAQs..."
                                />
                                <div className="flex gap-4">
                                    <button onClick={() => setStep(3)} className="flex-1 py-4 font-semibold text-slate-600 hover:bg-slate-50 transition-colors rounded-xl border border-slate-200">Retour</button>
                                    <button
                                        onClick={generateArticle}
                                        disabled={isGenerating || !guidelines}
                                        className="flex-[2] py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 disabled:bg-slate-200"
                                    >
                                        {isGenerating ? (
                                            <>
                                                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                                                Génération en cours...
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles size={20} />
                                                Générer l'article ({provider === 'lmstudio' ? 'Local' : provider === 'xai' ? 'xAI' : 'Cloud'})
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Step 5: Result */}
                        {step === 5 && (
                            <div className="space-y-6 animate-in zoom-in duration-500">
                                <div className="flex items-center justify-between mb-2">
                                    <h2 className="text-2xl font-bold text-slate-800">Article Prêt</h2>
                                    <div className="flex flex-col items-end gap-2">
                                        <button
                                            onClick={copyToClipboard} className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-100"> {copyStatus === 'success' ? <Check size={20} /> : <Copy size={20} />} {copyStatus === 'success' ? 'Copié !' : 'Copier'} </button> <button onClick={downloadArticle}
                                                className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-100"
                                            >
                                            <Download size={20} />
                                            Télécharger (.md)
                                        </button>

                                    </div>
                                </div>
                                <div className="bg-slate-50 p-8 rounded-2xl border border-slate-200 max-h-[600px] overflow-y-auto shadow-inner">
                                    <div className="prose prose-slate max-w-none">
                                        <pre className="whitespace-pre-wrap font-sans text-slate-700 leading-relaxed">
                                            {generatedArticle}
                                        </pre>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setStep(1)}
                                    className="w-full py-4 text-indigo-600 font-bold hover:bg-indigo-50 transition-colors rounded-xl border border-indigo-200"
                                >
                                    Générer un autre article
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer info */}
                <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white/70 backdrop-blur-sm p-6 rounded-xl border border-white shadow-sm">
                        <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                            <TrendingUp size={18} className="text-indigo-600" /> SEO Optimisé
                        </h4>
                        <p className="text-sm text-slate-600">Analyse intelligente des données Google Ads for un maximum de trafic.</p>
                    </div>
                    <div className="bg-white/70 backdrop-blur-sm p-6 rounded-xl border border-white shadow-sm">
                        <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                            <Monitor size={18} className="text-indigo-600" /> Mode Hybride
                        </h4>
                        <p className="text-sm text-slate-600">Choisissez entre la puissance de Claude, xAI ou la gratuité de LM Studio.</p>
                    </div>
                    <div className="bg-white/70 backdrop-blur-sm p-6 rounded-xl border border-white shadow-sm">
                        <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                            <Key size={18} className="text-indigo-600" /> Local & Sûr
                        </h4>
                        <p className="text-sm text-slate-600">Vos documents ne sont jamais stockés en ligne. Vos clés restent locales.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
