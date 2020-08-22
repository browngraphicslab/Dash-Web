import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from '@material-ui/core';
import { action, computed, IReactionDisposer, observable, runInAction } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { Doc, DocListCast, Field, Opt } from '../../../fields/Doc';
import { documentSchema } from "../../../fields/documentSchemas";
import { Id } from '../../../fields/FieldSymbols';
import { List } from '../../../fields/List';
import { createSchema, listSpec, makeInterface } from '../../../fields/Schema';
import { SchemaHeaderField } from '../../../fields/SchemaHeaderField';
import { Cast, NumCast, StrCast } from '../../../fields/Types';
import { returnFalse, returnZero } from '../../../Utils';
import { Docs } from '../../documents/Documents';
import { DocumentType } from "../../documents/DocumentTypes";
import { SetupDrag } from '../../util/DragManager';
import { SearchUtil } from '../../util/SearchUtil';
import { SelectionManager } from '../../util/SelectionManager';
import { Transform } from '../../util/Transform';
import { ColumnType } from "../collections/CollectionSchemaView";
import { CollectionView, CollectionViewType } from '../collections/CollectionView';
import { ViewBoxBaseComponent } from "../DocComponent";
import { DocumentView } from '../nodes/DocumentView';
import { FieldView, FieldViewProps } from '../nodes/FieldView';
import "./SearchBox.scss";

export const searchSchema = createSchema({ Document: Doc });

type SearchBoxDocument = makeInterface<[typeof documentSchema, typeof searchSchema]>;
const SearchBoxDocument = makeInterface(documentSchema, searchSchema);

@observer
export class SearchBox extends ViewBoxBaseComponent<FieldViewProps, SearchBoxDocument>(SearchBoxDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(SearchBox, fieldKey); }
    public static Instance: SearchBox;

    private _allIcons: string[] = [DocumentType.INK, DocumentType.AUDIO, DocumentType.COL, DocumentType.IMG, DocumentType.LINK, DocumentType.PDF, DocumentType.RTF, DocumentType.VID, DocumentType.WEB];
    private _numResultsPerPage = 500;
    private _numTotalResults = -1;
    private _endIndex = -1;
    private _lockPromise?: Promise<void>;
    private _resultsSet = new Map<Doc, number>();
    private _inputRef = React.createRef<HTMLInputElement>();
    private _maxSearchIndex: number = 0;
    private _curRequest?: Promise<any> = undefined;
    private _disposers: { [name: string]: IReactionDisposer } = {};
    private _blockedTypes = [DocumentType.PRESELEMENT, DocumentType.KVP, DocumentType.DOCHOLDER, DocumentType.SEARCH, DocumentType.SEARCHITEM, DocumentType.FONTICON, DocumentType.BUTTON, DocumentType.SCRIPTING];

    private currentSelectedCollection: DocumentView | undefined = undefined;
    private docsforfilter: Doc[] = [];
    private realTotalResults: number = 0;
    private collectionRef = React.createRef<HTMLSpanElement>();

    @observable _icons: string[] = this._allIcons;
    @observable _results: [Doc, string[], string[]][] = [];
    @observable _visibleElements: JSX.Element[] = [];
    @observable _visibleDocuments: Doc[] = [];
    @observable _deletedDocsStatus: boolean = false;
    @observable _onlyAliases: boolean = true;
    @observable _searchbarOpen = false;
    @observable _searchFullDB = "DB";
    @observable _noResults = "";
    @observable _pageStart = 0;
    @observable open = false;
    @observable children = 0;
    @observable newsearchstring = "";
    @observable headercount: number = 0;
    @observable headerscale: number = 0;
    @observable filter = false;

    constructor(props: any) {
        super(props);
        SearchBox.Instance = this;
    }

    componentDidMount = action(() => {
        if (this._inputRef.current) {
            this._inputRef.current.focus();
            this._searchbarOpen = true;
        }
    });

    componentWillUnmount() {
        Object.values(this._disposers).forEach(disposer => disposer?.());
    }

    @action.bound
    onChange(e: React.ChangeEvent<HTMLInputElement>) {
        this.layoutDoc._searchString = e.target.value;
        this.newsearchstring = e.target.value;
        if (e.target.value === "") {
            if (this.currentSelectedCollection) {
                this.setSearchDocsRecursive(this.currentSelectedCollection, undefined);
            }
            this.closeSearch(false);

            if (this.currentSelectedCollection !== undefined) {
                this.currentSelectedCollection = undefined;
                this.props.Document.selectedDoc = undefined;
            }
            this.open = false;
            this._results = [];
            this._resultsSet.clear();
            this._visibleElements = [];
            this._numTotalResults = -1;
            this._endIndex = -1;
            this._curRequest = undefined;
            this._maxSearchIndex = 0;
        }
    }

    enter = action((e: React.KeyboardEvent | undefined) => {
        if (!e || e.key === "Enter") {
            this.layoutDoc._searchString = this.newsearchstring;
            this._pageStart = 0;
            this.open = StrCast(this.layoutDoc._searchString) !== "" || this._searchFullDB !== "DB";
            this.submitSearch();
        }
    });

    getFinalQuery(query: string): string {
        //alters the query so it looks in the correct fields
        //if this is true, th`en not all of the field boxes are checked
        //TODO: data
        const initialfilters = Cast(this.props.Document._docFilters, listSpec("string"), []);

        const filters: string[] = [];

        for (let i = 0; i < initialfilters.length; i = i + 3) {
            if (initialfilters[i + 2] !== undefined) {
                filters.push(initialfilters[i]);
                filters.push(initialfilters[i + 1]);
                filters.push(initialfilters[i + 2]);
            }
        }

        const finalfilters: { [key: string]: string[] } = {};

        for (let i = 0; i < filters.length; i = i + 3) {
            if (finalfilters[filters[i]] !== undefined) {
                finalfilters[filters[i]].push(filters[i + 1]);
            }
            else {
                finalfilters[filters[i]] = [filters[i + 1]];
            }
        }

        for (const key in finalfilters) {
            const values = finalfilters[key];
            if (values.length === 1) {
                const mod = "_t:";
                const newWords: string[] = [];
                const oldWords = values[0].split(" ");
                oldWords.forEach((word, i) => {
                    i === 0 ? newWords.push(key + mod + "\"" + word + "\"") : newWords.push("AND " + key + mod + "\"" + word + "\"");
                });
                query = `(${query}) AND (${newWords.join(" ")})`;
            }
            else {
                for (let i = 0; i < values.length; i++) {
                    const mod = "_t:";
                    const newWords: string[] = [];
                    const oldWords = values[i].split(" ");
                    oldWords.forEach((word, i) => {
                        i === 0 ? newWords.push(key + mod + "\"" + word + "\"") : newWords.push("AND " + key + mod + "\"" + word + "\"");
                    });
                    const v = "(" + newWords.join(" ") + ")";
                    if (i === 0) {
                        query = `(${query}) AND (${v}`;
                        if (values.length === 1) {
                            query = query + ")";
                        }
                    }
                    else if (i === values.length - 1) {
                        query = query + " OR " + v + ")";
                    }
                    else {
                        query = query + " OR " + v;
                    }
                }
            }
        }

        return query.replace(/-\s+/g, '');
    }

    @action
    filterDocsByType(docs: Doc[]) {
        const finalDocs: Doc[] = [];
        docs.forEach(doc => {
            const layoutresult = StrCast(doc.type, "string") as DocumentType;
            if (layoutresult && !this._blockedTypes.includes(layoutresult) && this._icons.includes(layoutresult)) {
                finalDocs.push(doc);
            }
        });
        return finalDocs;
    }

    //TODO: basically all of this
    //gets all of the collections of all the docviews that are selected
    //if a collection is the only thing selected, search only in that collection (not its container)
    getCurCollections(): Doc[] {
        const selectedDocs: DocumentView[] = SelectionManager.SelectedDocuments();
        const collections: Doc[] = [];
        selectedDocs.forEach(async element => {
            const layout: string = StrCast(element.props.Document.layout);
            //checks if selected view (element) is a collection. if it is, adds to list to search through
            if (layout.indexOf("Collection") > -1) {
                //makes sure collections aren't added more than once
                if (!collections.includes(element.props.Document)) {
                    collections.push(element.props.Document);
                }
            }
            //makes sure collections aren't added more than once
            if (element.props.ContainingCollectionDoc && !collections.includes(element.props.ContainingCollectionDoc)) {
                collections.push(element.props.ContainingCollectionDoc);
            }
        });

        return collections;
    }


    searchCollection(query: string) {
        const selectedCollection = SelectionManager.SelectedDocuments()[0];
        query = query.toLowerCase();

        if (selectedCollection !== undefined) {
            this.currentSelectedCollection = selectedCollection;
            if (this.filter === true) {
                this.props.Document.selectedDoc = selectedCollection.props.Document;
            }
            let docs = DocListCast(selectedCollection.dataDoc[Doc.LayoutFieldKey(selectedCollection.dataDoc)]);
            const found: [Doc, string[], string[]][] = [];
            const docsforFilter: Doc[] = [];
            let newarray: Doc[] = [];

            while (docs.length > 0) {
                newarray = [];
                docs.forEach((d) => {
                    d.data && newarray.push(...DocListCast(d.data));
                    const hlights = new Set<string>();
                    this.documentKeys(d).forEach(key =>
                        Field.toString(d[key] as Field).toLowerCase().includes(query) && hlights.add(key));
                    if (Array.from(hlights.keys()).length > 0) {
                        found.push([d, Array.from(hlights.keys()), []]);
                        docsforFilter.push(d);
                    }
                });
                docs = newarray;
            }
            this._results = found;
            this.docsforfilter = docsforFilter;
            if (this.filter === true) {
                selectedCollection.props.Document._searchDocs = new List<Doc>(docsforFilter);
                this.setSearchDocsRecursive(selectedCollection, docsforFilter);
            }
            this._numTotalResults = found.length;
            this.realTotalResults = found.length;
        }
        else {
            this._noResults = "No collection selected :(";
        }

    }

    documentKeys(doc: Doc) {
        const keys: { [key: string]: boolean } = {};
        // bcz: ugh.  this is untracked since otherwise a large collection of documents will blast the server for all their fields.
        //  then as each document's fields come back, we update the documents _proxies.  Each time we do this, the whole schema will be
        //  invalidated and re-rendered.   This workaround will inquire all of the document fields before the options button is clicked.
        //  then by the time the options button is clicked, all of the fields should be in place.  If a new field is added while this menu
        //  is displayed (unlikely) it won't show up until something else changes.
        //TODO Types
        Doc.GetAllPrototypes(doc).map(proto => Object.keys(proto).forEach(key => keys[key] = false));
        return Array.from(Object.keys(keys));
    }

    @action
    submitSearch = async (reset?: boolean) => {
        if (this.currentSelectedCollection !== undefined) {
            this.setSearchDocsRecursive(this.currentSelectedCollection, undefined);
        }
        if (reset) {
            this.layoutDoc._searchString = "";
        }
        //this.props.Document._docFilters = new List();
        this._noResults = "";

        this.dataDoc[this.fieldKey] = new List<Doc>([]);
        this.headercount = 0;
        this.children = 0;
        let query = StrCast(this.layoutDoc._searchString);
        Doc.SetSearchQuery(query);
        this._searchFullDB ? query = this.getFinalQuery(query) : console.log("local");
        this.closeSearch(false);
        this._results = [];
        this._resultsSet.clear();
        this._visibleElements = [];
        this._visibleDocuments = [];

        if (query !== "" || this._searchFullDB === "My Stuff") {
            this._endIndex = 12;
            this._maxSearchIndex = 0;
            this._numTotalResults = -1;
            this._searchFullDB ? await this.getResults(query) : this.searchCollection(query);
            runInAction(() => {
                this._searchbarOpen = true;
                this.resultsScrolled();
            });
        }
    }

    getAllResults = async (query: string) => {
        return SearchUtil.Search(query, true, { fq: this.filterQuery, start: 0, rows: 10000000 });
    }

    private get filterQuery() {
        const baseExpr = "NOT system_b:true";
        const authorExpr = this._searchFullDB === "My Stuff" ? ` author_t:${Doc.CurrentUserEmail}` : undefined;
        const includeDeleted = this._deletedDocsStatus ? "" : " NOT deleted_b:true";
        const typeExpr = this._onlyAliases ? "NOT {!join from=id to=proto_i}type_t:*" : `(type_t:* OR {!join from=id to=proto_i}type_t:*) ${this._blockedTypes.map(type => `NOT ({!join from=id to=proto_i}type_t:${type}) AND NOT type_t:${type}`).join(" AND ")}`;
        // fq: type_t:collection OR {!join from=id to=proto_i}type_t:collection   q:text_t:hello
        const query = [baseExpr, authorExpr, includeDeleted, typeExpr].filter(q => q).join(" AND ").replace(/AND $/, "");
        return query;
    }

    @computed get primarySort() {
        const suffixMap = (type: ColumnType) => {
            switch (type) {
                case ColumnType.Date: return "_d";
                case ColumnType.String: return "_t";
                case ColumnType.Boolean: return "_b";
                case ColumnType.Number: return "_n";
            }
        };
        const headers = Cast(this.props.Document._schemaHeaders, listSpec(SchemaHeaderField), []);
        return headers.reduce((p: Opt<string>, header: SchemaHeaderField) => p || (header.desc !== undefined && suffixMap(header.type) ? (header.heading + suffixMap(header.type) + (header.desc ? " desc" : " asc")) : undefined), undefined);
    }

    getResults = async (query: string) => {
        this._lockPromise && (await this._lockPromise);
        this._lockPromise = new Promise(async res => {
            while (this._results.length <= this._endIndex && (this._numTotalResults === -1 || this._maxSearchIndex < this._numTotalResults)) {
                this._curRequest = SearchUtil.Search(query, true, { onlyAliases: true, allowAliases: true, /*sort: this.primarySort,*/ fq: this.filterQuery, start: 0, rows: this._numResultsPerPage, hl: true, "hl.fl": "*", }).then(action(async (res: SearchUtil.DocSearchResult) => {
                    // happens at the beginning
                    this.realTotalResults = res.numFound <= 0 ? 0 : res.numFound;
                    if (res.numFound !== this._numTotalResults && this._numTotalResults === -1) {
                        this._numTotalResults = res.numFound;
                    }
                    const highlighting = res.highlighting || {};
                    const highlightList = res.docs.map(doc => highlighting[doc[Id]]);
                    const lines = new Map<string, string[]>();
                    res.docs.map((doc, i) => lines.set(doc[Id], res.lines[i]));
                    const docs = res.docs;
                    const highlights: typeof res.highlighting = {};
                    docs.forEach((doc, index) => highlights[doc[Id]] = highlightList[index]);
                    const filteredDocs = this.filterDocsByType(docs);

                    runInAction(() => filteredDocs.forEach((doc, i) => {
                        const index = this._resultsSet.get(doc);
                        const highlight = highlights[doc[Id]];
                        const line = lines.get(doc[Id]) || [];
                        const hlights = highlight ? Object.keys(highlight).map(key => key.substring(0, key.length - 2)).filter(k => k) : [];
                        // if (this.findCommonElements(hlights)) {
                        // }
                        if (index === undefined) {
                            this._resultsSet.set(doc, this._results.length);
                            this._results.push([doc, hlights, line]);
                        } else {
                            this._results[index][1].push(...hlights);
                            this._results[index][2].push(...line);
                        }

                    }));

                    this._curRequest = undefined;
                }));
                this._maxSearchIndex += this._numResultsPerPage;

                await this._curRequest;
            }

            this.resultsScrolled();
            res();
        });
        return this._lockPromise;
    }

    startDragCollection = async () => {
        const res = await this.getAllResults(this.getFinalQuery(StrCast(this.layoutDoc._searchString)));
        const filtered = this.filterDocsByType(res.docs);
        const docs = filtered.map(doc => Doc.GetT(doc, "isPrototype", "boolean", true) ? Doc.MakeDelegate(doc) : Doc.MakeAlias(doc));
        let x = 0;
        let y = 0;
        for (const doc of docs.map(d => Doc.Layout(d))) {
            doc.x = x;
            doc.y = y;
            const size = 200;
            const aspect = NumCast(doc._nativeHeight) / NumCast(doc._nativeWidth, 1);
            if (aspect > 1) {
                doc._height = size;
                doc._width = size / aspect;
            } else if (aspect > 0) {
                doc._width = size;
                doc._height = size * aspect;
            } else {
                doc._width = size;
                doc._height = size;
            }
            x += 250;
            if (x > 1000) {
                x = 0;
                y += 300;
            }
        }
        return Docs.Create.SchemaDocument(Cast(this.props.Document._schemaHeaders, listSpec(SchemaHeaderField), []), DocListCast(this.dataDoc[this.fieldKey]), { _autoHeight: true, _viewType: CollectionViewType.Schema, title: StrCast(this.layoutDoc._searchString) });
    }

    @action.bound
    openSearch(e: React.SyntheticEvent) {
        e.stopPropagation();
        this._results.forEach(result => Doc.BrushDoc(result[0]));
        this._searchbarOpen = true;
    }

    @action.bound
    closeSearch = (closesearchbar = true) => {
        this._results.forEach(result => {
            Doc.UnBrushDoc(result[0]);
            Doc.ClearSearchMatches();
        });
        closesearchbar && (this._searchbarOpen = false);
    }

    @action.bound
    closeResults() {
        this._results = [];
        this._resultsSet.clear();
        this._visibleElements = [];
        this._visibleDocuments = [];
        this._numTotalResults = -1;
        this._endIndex = -1;
        this._curRequest = undefined;
    }

    @action
    resultsScrolled = (e?: React.UIEvent<HTMLDivElement>) => {
        this._endIndex = 30;
        const headers = new Set<string>(["title", "author", "text", "type", "data", "*lastModified", "context"]);

        if (this._numTotalResults <= this._maxSearchIndex) {
            this._numTotalResults = this._results.length;
        }

        // only hit right at the beginning
        // visibleElements is all of the elements (even the ones you can't see)
        if (this._visibleElements.length !== this._numTotalResults) {
            // undefined until a searchitem is put in there
            this._visibleElements = Array<JSX.Element>(this._numTotalResults === -1 ? 0 : this._numTotalResults);
            this._visibleDocuments = Array<Doc>(this._numTotalResults === -1 ? 0 : this._numTotalResults);
        }
        let max = this._numResultsPerPage;
        max > this._results.length ? max = this._results.length : console.log("");
        for (let i = this._pageStart; i < max; i++) {
            //if the index is out of the window then put a placeholder in
            //should ones that have already been found get set to placeholders?

            let result: [Doc, string[], string[]] | undefined = undefined;

            result = this._results[i];
            if (result) {
                const highlights = Array.from([...Array.from(new Set(result[1]).values())]);
                const lines = new List<string>(result[2]);
                highlights.forEach((item) => headers.add(item));
                Doc.SetSearchMatch(result[0], { searchMatch: 1 });
                if (i < this._visibleDocuments.length) {
                    this._visibleDocuments[i] = result[0];
                    Doc.BrushDoc(result[0]);
                    Doc.AddDocToList(this.dataDoc, this.props.fieldKey, result[0]);
                    this.children++;
                }
            }
        }
        this.headerscale = headers.size;
        const oldSchemaHeaders = Cast(this.props.Document._schemaHeaders, listSpec("string"), []);
        if (oldSchemaHeaders?.length && typeof oldSchemaHeaders[0] !== "object") {
            const newSchemaHeaders = oldSchemaHeaders.map(i => typeof i === "string" ? new SchemaHeaderField(i, "#f1efeb") : i);
            headers.forEach(header => {
                if (oldSchemaHeaders.includes(header) === false) {
                    newSchemaHeaders.push(new SchemaHeaderField(header, "#f1efeb"));
                }
            });
            this.headercount = newSchemaHeaders.length;
            this.props.Document._schemaHeaders = new List<SchemaHeaderField>(newSchemaHeaders);
        } else if (this.props.Document._schemaHeaders === undefined) {
            this.props.Document._schemaHeaders = new List<SchemaHeaderField>([new SchemaHeaderField("title", "#f1efeb")]);
        }
        if (this._maxSearchIndex >= this._numTotalResults) {
            this._visibleElements.length = this._results.length;
            this._visibleDocuments.length = this._results.length;
        }
    }

    findCommonElements(arr2: string[]) {
        const arr1 = ["layout", "data"];
        return arr1.some(item => arr2.includes(item));
    }

    getTransform = () => this.props.ScreenToLocalTransform().translate(-5, -65);// listBox padding-left and pres-box-cont minHeight
    panelHeight = () => this.props.PanelHeight();

    selectElement = (doc: Doc) => {
        //this.gotoDocument(this.childDocs.indexOf(doc), NumCasst(this.layoutDoc._itemIndex));
    }
    returnHeight = () => 31 + 31 * 6;
    returnLength = () => Math.min(window.innerWidth, 51 + 205 * Cast(this.props.Document._schemaHeaders, listSpec(SchemaHeaderField), []).length);

    @action
    changeSearchScope = (scope: string) => {
        scope && (this.filter = false);
        this._searchFullDB = scope;
        this.dataDoc[this.fieldKey] = new List<Doc>([]);
        if (this.currentSelectedCollection !== undefined) {
            this.setSearchDocsRecursive(this.currentSelectedCollection, undefined);
        }
        this.submitSearch();
    }

    @computed get scopeButtons() {
        return <div style={{
            height: 25,
            paddingLeft: "4px",
            paddingRight: "4px",
            border: "1px solid gray",
            borderRadius: "0.3em",
            borderBottom: !this.open ? "1px solid" : "none",
        }}>
            <form className="beta" style={{ justifyContent: "space-evenly", display: "flex" }}>
                <div style={{ display: "contents" }}>
                    <div className="radio" style={{ margin: 0 }}>
                        <label style={{ fontSize: 12, marginTop: 6 }} >
                            <input type="radio" style={{ marginLeft: -16, marginTop: -1 }} checked={!this._searchFullDB} onChange={() => this.changeSearchScope("")} />
                            Collection
                        </label>
                    </div>
                    <div className="radio" style={{ margin: 0 }}>
                        <label style={{ fontSize: 12, marginTop: 6 }} >
                            <input type="radio" style={{ marginLeft: -16, marginTop: -1 }} checked={this._searchFullDB?.length ? true : false} onChange={() => this.changeSearchScope("DB")} />
                            DB
                            <span onClick={action(() => this._searchFullDB = this._searchFullDB === "My Stuff" ? "DB" : "My Stuff")}>
                                {this._searchFullDB === "My Stuff" ? "(me)" : "(full)"}
                            </span>
                        </label>
                    </div>
                </div>
            </form>
        </div>;
    }

    setSearchDocsRecursive = (collectionView: DocumentView, filter: Doc[] | undefined) => {
        let docs = DocListCast(collectionView.dataDoc[Doc.LayoutFieldKey(collectionView.dataDoc)]);
        let newarray: Doc[] = [];
        while (docs.length > 0) {
            newarray = [];
            docs.forEach(d => {
                const subDocs = DocListCast(d.data);
                if (subDocs.length) {
                    d._searchDocs = filter ? new List<Doc>(filter) : undefined;
                    DocListCast(d.data).forEach(newdoc => newarray.push(newdoc));
                }
            });
            docs = newarray;
        }
        collectionView.props.Document._searchDocs = filter ? new List<Doc>(filter) : undefined;
        this.props.Document.selectedDoc = filter ? collectionView.props.Document : undefined;
    }

    render() {
        this.props.Document._chromeStatus === "disabled";
        this.props.Document._searchDoc = true;
        const rows = this.children;
        return (
            <div style={{ pointerEvents: "all" }} className="searchBox-container">
                <div style={{ position: "absolute", left: 15, height: 32, alignItems: "center", display: "flex" }}>{`${Doc.CurrentUserEmail}/${Cast(Doc.UserDoc().activeDashboard, Doc, null)?.title}`}</div>
                <div className="searchBox-bar">
                    <div style={{ position: "relative", display: "flex", width: 450 }}>
                        <input value={this.newsearchstring} autoComplete="off" onChange={this.onChange} type="text" placeholder="Search..." id="search-input" ref={this._inputRef}
                            className="searchBox-barChild searchBox-input" onPointerDown={this.openSearch} onKeyPress={this.enter} onFocus={this.openSearch}
                            style={{ padding: 1, paddingLeft: 20, paddingRight: 60, color: "black", height: 20, width: 250 }} />
                        <div style={{ display: "flex", alignItems: "center" }}>
                            <div style={{ position: "absolute", left: 10 }}>
                                <Tooltip title={<div className="dash-tooltip" >drag search results as collection</div>}>
                                    <div><FontAwesomeIcon onPointerDown={SetupDrag(this.collectionRef, () => StrCast(this.layoutDoc._searchString) ? this.startDragCollection() : undefined)} icon={"search"} size="lg"
                                        style={{ cursor: "hand", color: "black", padding: 1, position: "relative" }} /></div>
                                </Tooltip>
                            </div>
                            <div style={{ position: "absolute", left: 200, width: 30, zIndex: 9000, color: "grey", background: "white", }}>
                                {`${this._results.length}` + " of " + `${this.realTotalResults}`}
                            </div>
                            <div style={{ cursor: "default", left: 235, position: "absolute", }}>
                                <Tooltip title={<div className="dash-tooltip" >only display documents matching search</div>} >
                                    <div>
                                        <FontAwesomeIcon icon={"filter"} size="lg"
                                            style={{ cursor: "hand", padding: 1, backgroundColor: this.filter ? "white" : "lightgray", color: this.filter ? "black" : "white" }}
                                            onPointerDown={e => { e.stopPropagation(); SetupDrag(this.collectionRef, () => this.layoutDoc._searchString ? this.startDragCollection() : undefined); }}
                                            onClick={action(() => {
                                                this.filter = !this.filter && !this._searchFullDB;
                                                this.currentSelectedCollection && this.setSearchDocsRecursive(this.currentSelectedCollection, this.filter ? this.docsforfilter : undefined);
                                            })} />
                                    </div>
                                </Tooltip>
                            </div>
                            {this.scopeButtons}
                        </div>

                    </div >
                </div >
                {!this._searchbarOpen ? (null) : <div style={{ zIndex: 20000, color: "black" }}>
                    <div style={{ display: "flex", justifyContent: "center", }}>
                        <div style={{ display: this.open ? "flex" : "none", overflow: "auto", }}>
                            <CollectionView {...this.props}
                                Document={this.props.Document}
                                moveDocument={returnFalse}
                                removeDocument={returnFalse}
                                PanelHeight={this.open ? this.returnHeight : returnZero}
                                PanelWidth={this.open ? this.returnLength : returnZero}
                                overflow={length > window.innerWidth || rows > 6 ? true : false}
                                focus={this.selectElement}
                                ScreenToLocalTransform={Transform.Identity}
                            />
                        </div>
                    </div>
                </div>
                }
            </div >
        );
    }
}