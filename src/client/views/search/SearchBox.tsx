import { library } from '@fortawesome/fontawesome-svg-core';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable, runInAction, IReactionDisposer, reaction } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import * as rp from 'request-promise';
import { Doc, DocListCast } from '../../../fields/Doc';
import { Id } from '../../../fields/FieldSymbols';
import { Cast, NumCast, StrCast } from '../../../fields/Types';
import { Utils, returnTrue, emptyFunction, returnFalse, emptyPath, returnOne, returnEmptyString, returnEmptyFilter } from '../../../Utils';
import { Docs, DocumentOptions } from '../../documents/Documents';
import { SetupDrag, DragManager } from '../../util/DragManager';
import { SearchUtil } from '../../util/SearchUtil';
import "./SearchBox.scss";
import { SearchItem } from './SearchItem';
import { IconBar } from './IconBar';
import { FieldView, FieldViewProps } from '../nodes/FieldView';
import { DocumentType } from "../../documents/DocumentTypes";
import { DocumentView } from '../nodes/DocumentView';
import { SelectionManager } from '../../util/SelectionManager';
import { FilterQuery } from 'mongodb';
import { CollectionLinearView } from '../collections/CollectionLinearView';
import { CurrentUserUtils } from '../../util/CurrentUserUtils';

import { CollectionDockingView } from '../collections/CollectionDockingView';
import { ScriptField, ComputedField } from '../../../fields/ScriptField';
import { PrefetchProxy } from '../../../fields/Proxy';
import { List } from '../../../fields/List';
import { faSearch, faFilePdf, faFilm, faImage, faObjectGroup, faStickyNote, faMusic, faLink, faChartBar, faGlobeAsia, faBan, faVideo, faCaretDown } from '@fortawesome/free-solid-svg-icons';
import { Transform } from '../../util/Transform';
import { MainView } from "../MainView";
import { Scripting, _scriptingGlobals } from '../../util/Scripting';
import { CollectionView, CollectionViewType } from '../collections/CollectionView';
import { ViewBoxBaseComponent } from "../DocComponent";
import { documentSchema } from "../../../fields/documentSchemas";
import { makeInterface, createSchema } from '../../../fields/Schema';
import { listSpec } from '../../../fields/Schema';
import * as _ from "lodash";
import { checkIfStateModificationsAreAllowed } from 'mobx/lib/internal';
import { SchemaHeaderField } from '../../../fields/SchemaHeaderField';
import { indexOf } from 'lodash';
import { protocol } from 'socket.io-client';


library.add(faTimes);

export const searchSchema = createSchema({
    id: "string",
    Document: Doc,
    searchQuery: "string",
});

export enum Keys {
    TITLE = "title",
    AUTHOR = "author",
    DATA = "data"
}

export interface filterData {
    deletedDocsStatus: boolean;
    authorFieldStatus: boolean;
    titleFieldStatus: boolean;
    basicWordStatus: boolean;
    icons: string[];
}

type SearchBoxDocument = makeInterface<[typeof documentSchema, typeof searchSchema]>;
const SearchBoxDocument = makeInterface(documentSchema, searchSchema);

//React.Component<SearchProps> 
@observer
export class SearchBox extends ViewBoxBaseComponent<FieldViewProps, SearchBoxDocument>(SearchBoxDocument) {

    @computed get _searchString() { return this.layoutDoc.searchQuery; }
    @computed set _searchString(value) { this.layoutDoc.searchQuery = (value); }
    @observable private _resultsOpen: boolean = false;
    @observable _searchbarOpen: boolean = false;
    @observable private _results: [Doc, string[], string[]][] = [];
    @observable private _openNoResults: boolean = false;
    @observable private _visibleElements: JSX.Element[] = [];
    @observable private _visibleDocuments: Doc[] = [];

    private _resultsSet = new Map<Doc, number>();
    private _resultsRef = React.createRef<HTMLDivElement>();
    public inputRef = React.createRef<HTMLInputElement>();

    private _isSearch: ("search" | "placeholder" | undefined)[] = [];
    private _isSorted: ("sorted" | "placeholder" | undefined)[] = [];

    private _numTotalResults = -1;
    private _endIndex = -1;

    static Instance: SearchBox;

    private _maxSearchIndex: number = 0;
    private _curRequest?: Promise<any> = undefined;
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(SearchBox, fieldKey); }

    private new_buckets: { [characterName: string]: number } = {};
    //if true, any keywords can be used. if false, all keywords are required.
    //this also serves as an indicator if the word status filter is applied
    @observable private _basicWordStatus: boolean = false;
    @observable private _nodeStatus: boolean = false;
    @observable private _keyStatus: boolean = false;

    @observable private newAssign: boolean = true;

    constructor(props: any) {

        super(props);
        SearchBox.Instance = this;
        if (!_scriptingGlobals.hasOwnProperty("handleNodeChange")) {
            Scripting.addGlobal(this.handleNodeChange);
        }
        if (!_scriptingGlobals.hasOwnProperty("handleKeyChange")) {
            Scripting.addGlobal(this.handleKeyChange);
        }
        if (!_scriptingGlobals.hasOwnProperty("handleWordQueryChange")) {
            Scripting.addGlobal(this.handleWordQueryChange);
        }
        if (!_scriptingGlobals.hasOwnProperty("updateIcon")) {
            Scripting.addGlobal(this.updateIcon);
        }
        if (!_scriptingGlobals.hasOwnProperty("updateTitleStatus")) {
            Scripting.addGlobal(this.updateTitleStatus);
        }
        if (!_scriptingGlobals.hasOwnProperty("updateAuthorStatus")) {
            Scripting.addGlobal(this.updateAuthorStatus);
        }
        if (!_scriptingGlobals.hasOwnProperty("updateDeletedStatus")) {
            Scripting.addGlobal(this.updateDeletedStatus);
        }


        this.resultsScrolled = this.resultsScrolled.bind(this);

        // new PrefetchProxy(Docs.Create.SearchItemBoxDocument({
        //     title: "search item template",
        //     backgroundColor: "transparent", _xMargin: 5, _height: 46, isTemplateDoc: true, isTemplateForField: "data"
        // }));


        // if (!this.searchItemTemplate) { // create exactly one presElmentBox template to use by any and all presentations.
        //     Doc.UserDoc().searchItemTemplate = new PrefetchProxy(Docs.Create.SearchItemBoxDocument({ title: "search item template", backgroundColor: "transparent", _xMargin: 5, _height: 46, isTemplateDoc: true, isTemplateForField: "data" }));
        //     // this script will be called by each presElement to get rendering-specific info that the PresBox knows about but which isn't written to the PresElement
        //     // this is a design choice -- we could write this data to the presElements which would require a reaction to keep it up to date, and it would prevent
        //     // the preselement docs from being part of multiple presentations since they would all have the same field, or we'd have to keep per-presentation data
        //     // stored on each pres element.  
        //     (this.searchItemTemplate as Doc).lookupField = ScriptField.MakeFunction("lookupSearchBoxField(container, field, data)",
        //         { field: "string", data: Doc.name, container: Doc.name });
        // }
    }
    @observable setupButtons = false;
    componentDidMount = () => {
        if (this.setupButtons == false) {

            runInAction(() => this.setupButtons == true);
        }
        if (this.inputRef.current) {
            this.inputRef.current.focus();
            runInAction(() => { this._searchbarOpen = true });
        }
        if (this.rootDoc.searchQuery && this.newAssign) {
            const sq = this.rootDoc.searchQuery;
            runInAction(() => {

                // this._deletedDocsStatus=this.props.filterQuery!.deletedDocsStatus;
                // this._authorFieldStatus=this.props.filterQuery!.authorFieldStatus
                // this._titleFieldStatus=this.props.filterQuery!.titleFieldStatus;
                // this._basicWordStatus=this.props.filterQuery!.basicWordStatus;
                // this._icons=this.props.filterQuery!.icons;
                this.newAssign = false;
            });
            runInAction(() => {
                this.layoutDoc._searchString = StrCast(sq);
                this.submitSearch();
            });
        }
    };


    @action
    getViews = (doc: Doc) => SearchUtil.GetViewsOfDocument(doc)


    @observable newsearchstring: string = "";
    @action.bound
    onChange(e: React.ChangeEvent<HTMLInputElement>) {
        this.layoutDoc._searchString = e.target.value;
        console.log(e.target.value);
        this.newsearchstring = e.target.value;


        if (e.target.value === "") {
            this.props.Document._schemaHeaders = new List<SchemaHeaderField>([]);
            if (this.currentSelectedCollection !== undefined) {
                this.currentSelectedCollection.props.Document._searchDocs = new List<Doc>([]);
                this.currentSelectedCollection = undefined;
                this.props.Document.selectedDoc = undefined;

            }
            console.log("CLOSE");
            runInAction(() => { this.open = false });
        }
        this._openNoResults = false;
        this._results = [];
        this._resultsSet.clear();
        this._visibleElements = [];
        this._numTotalResults = -1;
        this._endIndex = -1;
        this._curRequest = undefined;
        this._maxSearchIndex = 0;
    }

    enter = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            this.layoutDoc._searchString = this.newsearchstring;
            // if (this._icons !== this._allIcons) {
            //     runInAction(() => { this.expandedBucket = false });
            // }
            if (StrCast(this.layoutDoc._searchString) !== "") {
                console.log("OPEN");
                runInAction(() => { this.open = true });
            }
            else {
                console.log("CLOSE");
                runInAction(() => { this.open = false });

            }
            this.submitSearch();


        }
    }

    @observable open: boolean = false;


    public static async convertDataUri(imageUri: string, returnedFilename: string) {
        try {
            const posting = Utils.prepend("/uploadURI");
            const returnedUri = await rp.post(posting, {
                body: {
                    uri: imageUri,
                    name: returnedFilename
                },
                json: true,
            });
            return returnedUri;

        } catch (e) {
            console.log(e);
        }
    }

    public _allIcons: string[] = [DocumentType.AUDIO, DocumentType.COL, DocumentType.IMG, DocumentType.LINK, DocumentType.PDF, DocumentType.RTF, DocumentType.VID, DocumentType.WEB];
    //if true, any keywords can be used. if false, all keywords are required.
    //this also serves as an indicator if the word status filter is applied
    @observable private _filterOpen: boolean = false;
    //if icons = all icons, then no icon filter is applied
    // get _icons() { return this.props.searchFileTypes; }
    // set _icons(value) {
    //     this.props.setSearchFileTypes(value);
    // }
    @observable _icons: string[] = this._allIcons;
    //if all of these are true, no key filter is applied
    @observable private _titleFieldStatus: boolean = true;
    @observable private _authorFieldStatus: boolean = true;
    //this also serves as an indicator if the collection status filter is applied
    @observable public _deletedDocsStatus: boolean = false;
    @observable private _collectionStatus = false;


    getFinalQuery(query: string): string {
        //alters the query so it looks in the correct fields
        //if this is true, then not all of the field boxes are checked
        //TODO: data
        if (this.fieldFiltersApplied) {
            query = this.applyBasicFieldFilters(query);
            query = query.replace(/\s+/g, ' ').trim();
        }

        //alters the query based on if all words or any words are required
        //if this._wordstatus is false, all words are required and a + is added before each
        if (!this._basicWordStatus) {
            query = this.basicRequireWords(query);
            query = query.replace(/\s+/g, ' ').trim();
        }

        // if should be searched in a specific collection
        if (this._collectionStatus) {
            query = this.addCollectionFilter(query);
            query = query.replace(/\s+/g, ' ').trim();
            console.log(query)

        }
        return query;
    }

    basicRequireWords(query: string): string {
        return query.split(" ").join(" + ").replace(/ + /, "");
    }

    @action
    filterDocsByType(docs: Doc[]) {
        const finalDocs: Doc[] = [];
        const blockedTypes: string[] = ["preselement", "docholder", "collection", "search", "searchitem", "script", "fonticonbox", "button", "label"];
        docs.forEach(doc => {
            const layoutresult = Cast(doc.type, "string");
            if (layoutresult && !blockedTypes.includes(layoutresult)) {
                if (layoutresult && this._icons.includes(layoutresult)) {
                    finalDocs.push(doc);
                }
            }
        });
        return finalDocs;
    }

    addCollectionFilter(query: string): string {
        const collections: Doc[] = this.getCurCollections();

        console.log(collections);
        const oldWords = query.split(" ");

        const collectionString: string[] = [];
        collections.forEach(doc => {
            const proto = doc.proto;
            const protoId = (proto || doc)[Id];
            const colString: string = "{!join from=data_l to=id}id:" + protoId + " ";
            collectionString.push(colString);
        });

        let finalColString = collectionString.join(" ");
        finalColString = finalColString.trim();
        return "+(" + finalColString + ")" + query;
    }

    get filterTypes() {
        return this._icons.length === this._allIcons.length ? undefined : this._icons;
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


    currentSelectedCollection: DocumentView | undefined = undefined;
    docsforfilter: Doc[] = [];

    searchCollection(query: string) {

        const selectedCollection: DocumentView = SelectionManager.SelectedDocuments()[0];

        if (selectedCollection !== undefined) {
            this.currentSelectedCollection = selectedCollection;
            if (this.filter === true) {
                this.props.Document.selectedDoc = selectedCollection.props.Document;
            }
            let docs = DocListCast(selectedCollection.dataDoc[Doc.LayoutFieldKey(selectedCollection.dataDoc)]);
            let found: [Doc, string[], string[]][] = [];
            let docsforFilter: Doc[] = []
            let newarray: Doc[] = [];

            while (docs.length > 0) {
                console.log("iteration");
                newarray = [];
                docs.forEach((d) => {
                    console.log(d);
                    if (d.data != undefined) {
                        let newdocs = DocListCast(d.data);
                        newdocs.forEach((newdoc) => {
                            console.log(newdoc);
                            newarray.push(newdoc);

                        });
                    }


                    let hlights: string[] = [];

                    const protos = Doc.GetAllPrototypes(d);
                    let proto = protos[protos.length - 1];
                    protos.forEach(proto => {
                        Object.keys(proto).forEach(key => {
                            // console.log(key, d[key]);
                            if (StrCast(d[key]).includes(query) && !hlights.includes(key)) {
                                hlights.push(key);
                            }
                        })
                    });
                    if (hlights.length > 0) {
                        found.push([d, hlights, []]);
                        docsforFilter.push(d);
                    };
                });
                docs = newarray;
            }
            this._results = found;
            this.docsforfilter = docsforFilter;
            if (this.filter === true) {
                selectedCollection.props.Document._searchDocs = new List<Doc>(docsforFilter);
            }
            this._numTotalResults = found.length;
        }
        else {
            this.noresults = "No collection selected :(";
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
        Doc.GetAllPrototypes(doc).map
            (proto => Object.keys(proto).forEach(key => keys[key] = false));
        return Array.from(Object.keys(keys));
    }

    applyBasicFieldFilters(query: string) {
        let finalQuery = "";

        if (this._titleFieldStatus) {
            finalQuery = finalQuery + this.basicFieldFilters(query, Keys.TITLE);
        }
        if (this._authorFieldStatus) {
            finalQuery = finalQuery + this.basicFieldFilters(query, Keys.AUTHOR);
        }
        if (this._deletedDocsStatus) {
            finalQuery = finalQuery + this.basicFieldFilters(query, Keys.DATA);
        }
        return finalQuery;
    }

    basicFieldFilters(query: string, type: string): string {
        const oldWords = query.split(" ");
        let mod = "";

        if (type === Keys.AUTHOR) {
            mod = " author_t:";
        } if (type === Keys.DATA) {
            //TODO
        } if (type === Keys.TITLE) {
            mod = " title_t:";
        }

        const newWords: string[] = [];
        oldWords.forEach(word => {
            const newWrd = mod + word;
            newWords.push(newWrd);
        });

        query = newWords.join(" ");

        return query;
    }

    get fieldFiltersApplied() { return !(this._authorFieldStatus && this._titleFieldStatus); }

    @action
    submitSearch = async (reset?: boolean) => {
        this.checkIcons();
        if (reset) {
            this.layoutDoc._searchString = "";
        }
        this.props.Document._docFilters = undefined;
        this.noresults = "";
        this.dataDoc[this.fieldKey] = new List<Doc>([]);
        this.headercount = 0;
        this.children = 0;
        this.buckets = [];
        this.new_buckets = {};
        const query = StrCast(this.layoutDoc._searchString);
        this.getFinalQuery(query);
        this._results = [];
        this._resultsSet.clear();
        this._isSearch = [];
        this._isSorted = [];
        this._visibleElements = [];
        this._visibleDocuments = [];
        if (StrCast(this.props.Document.searchQuery)) {
            if (this._timeout) { clearTimeout(this._timeout); this._timeout = undefined };
            this._timeout = setTimeout(() => {
                console.log("Resubmitting search");
            }, 60000);
        }

        if (query !== "") {
            this._endIndex = 12;
            this._maxSearchIndex = 0;
            this._numTotalResults = -1;
            this.scale === true ? await this.getResults(query) : this.searchCollection(query);
            runInAction(() => {
                this._resultsOpen = true;
                this._searchbarOpen = true;
                this._openNoResults = true;
                this.resultsScrolled();

            });
        }
    }

    @observable scale = true;

    @observable _timeout: any = undefined;

    @observable firststring: string = "";
    @observable secondstring: string = "";

    @observable bucketcount: number[] = [];
    @observable buckets: Doc[] | undefined;

    getAllResults = async (query: string) => {
        return SearchUtil.Search(query, true, { fq: this.filterQuery, start: 0, rows: 10000000 });
    }

    private get filterQuery() {
        const types = this.filterTypes;
        const baseExpr = "NOT baseProto_b:true";
        const includeDeleted = this.getDataStatus() ? "" : " NOT deleted_b:true";
        const includeIcons = this.getDataStatus() ? "" : " NOT type_t:fonticonbox";
        // const typeExpr = !types ? "" : ` (${types.map(type => `({!join from=id to=proto_i}type_t:"${type}" AND NOT type_t:*) OR type_t:"${type}"`).join(" ")})`;
        // fq: type_t:collection OR {!join from=id to=proto_i}type_t:collection   q:text_t:hello
        const query = [baseExpr, includeDeleted, includeIcons].join(" AND ").replace(/AND $/, "");
        return query;
    }

    getDataStatus() { return this._deletedDocsStatus; }

    private NumResults = 25;
    private lockPromise?: Promise<void>;
    getResults = async (query: string) => {
        console.log("Get");
        if (this.lockPromise) {
            await this.lockPromise;
        }
        this.lockPromise = new Promise(async res => {
            while (this._results.length <= this._endIndex && (this._numTotalResults === -1 || this._maxSearchIndex < this._numTotalResults)) {
                this._curRequest = SearchUtil.Search(query, true, { fq: this.filterQuery, start: this._maxSearchIndex, rows: this.NumResults, hl: true, "hl.fl": "*", }).then(action(async (res: SearchUtil.DocSearchResult) => {
                    // happens at the beginning
                    if (res.numFound !== this._numTotalResults && this._numTotalResults === -1) {
                        this._numTotalResults = res.numFound;
                    }
                    const highlighting = res.highlighting || {};
                    const highlightList = res.docs.map(doc => highlighting[doc[Id]]);
                    const lines = new Map<string, string[]>();
                    res.docs.map((doc, i) => lines.set(doc[Id], res.lines[i]));
                    const docs = await Promise.all(res.docs.map(async doc => (await Cast(doc.extendsDoc, Doc)) || doc));
                    const highlights: typeof res.highlighting = {};
                    docs.forEach((doc, index) => highlights[doc[Id]] = highlightList[index]);
                    const filteredDocs = this.filterDocsByType(docs);

                    runInAction(() => {
                        filteredDocs.forEach((doc, i) => {
                            const index = this._resultsSet.get(doc);
                            const highlight = highlights[doc[Id]];
                            const line = lines.get(doc[Id]) || [];
                            const hlights = highlight ? Object.keys(highlight).map(key => key.substring(0, key.length - 2)) : [];
                            console.log(hlights);
                            doc ? console.log(Cast(doc.context, Doc)) : null;
                            if (this.findCommonElements(hlights)) {
                            }
                            else {
                                const layoutresult = Cast(doc.type, "string");
                                if (layoutresult) {
                                    if (this.new_buckets[layoutresult] === undefined) {
                                        this.new_buckets[layoutresult] = 1;
                                    }
                                    else {
                                        this.new_buckets[layoutresult] = this.new_buckets[layoutresult] + 1;
                                    }
                                }
                                if (index === undefined) {
                                    this._resultsSet.set(doc, this._results.length);
                                    this._results.push([doc, hlights, line]);
                                } else {
                                    this._results[index][1].push(...hlights);
                                    this._results[index][2].push(...line);
                                }
                            }
                        });
                    });

                    this._curRequest = undefined;
                }));
                this._maxSearchIndex += this.NumResults;

                await this._curRequest;
            }

            this.resultsScrolled();
            res();
        });
        return this.lockPromise;
    }
    @observable noresults = "";
    collectionRef = React.createRef<HTMLSpanElement>();
    startDragCollection = async () => {
        const res = await this.getAllResults(this.getFinalQuery(StrCast(this.layoutDoc._searchString)));
        const filtered = this.filterDocsByType(res.docs);
        const docs = filtered.map(doc => {
            const isProto = Doc.GetT(doc, "isPrototype", "boolean", true);
            if (isProto) {
                return Doc.MakeDelegate(doc);
            } else {
                return Doc.MakeAlias(doc);
            }
        });
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
        const filter: filterData = {
            deletedDocsStatus: this._deletedDocsStatus,
            authorFieldStatus: this._authorFieldStatus,
            titleFieldStatus: this._titleFieldStatus,
            basicWordStatus: this._basicWordStatus,
            icons: this._icons,
        }
        return Docs.Create.SearchDocument({ _autoHeight: true, _viewType: CollectionViewType.Schema, title: StrCast(this.layoutDoc._searchString), searchQuery: StrCast(this.layoutDoc._searchString) });
    }

    @action.bound
    openSearch(e: React.SyntheticEvent) {
        e.stopPropagation();
        this._openNoResults = false;
        this._resultsOpen = true;
        this._searchbarOpen = true;
    }

    @action.bound
    closeSearch = () => {
        this.closeResults();
        this._searchbarOpen = false;
    }

    @action.bound
    closeResults() {
        this._resultsOpen = false;
        this._results = [];
        this._resultsSet.clear();
        this._visibleElements = [];
        this._visibleDocuments = [];
        this._numTotalResults = -1;
        this._endIndex = -1;
        this._curRequest = undefined;
    }

    @observable children: number = 0;
    @action
    resultsScrolled = (e?: React.UIEvent<HTMLDivElement>) => {
        if (!this._resultsRef.current) return;
        this.props.Document._schemaHeaders = new List<SchemaHeaderField>([]);

        const scrollY = e ? e.currentTarget.scrollTop : this._resultsRef.current ? this._resultsRef.current.scrollTop : 0;
        const itemHght = 53;
        const startIndex = Math.floor(Math.max(0, scrollY / itemHght));
        //const endIndex = Math.ceil(Math.min(this._numTotalResults - 1, startIndex + (this._resultsRef.current.getBoundingClientRect().height / itemHght)));
        const endIndex = 30;
        this._endIndex = endIndex === -1 ? 12 : endIndex;
        this._endIndex = 30;
        let headers = new Set<string>(["title", "author", "lastModified"]);
        if ((this._numTotalResults === 0 || this._results.length === 0) && this._openNoResults) {
            if (this.noresults === "") {
                this.noresults = "No search results :(";
            }
            return;
        }

        if (this._numTotalResults <= this._maxSearchIndex) {
            this._numTotalResults = this._results.length;
        }

        // only hit right at the beginning
        // visibleElements is all of the elements (even the ones you can't see)
        else if (this._visibleElements.length !== this._numTotalResults) {
            // undefined until a searchitem is put in there
            this._visibleElements = Array<JSX.Element>(this._numTotalResults === -1 ? 0 : this._numTotalResults);
            this._visibleDocuments = Array<Doc>(this._numTotalResults === -1 ? 0 : this._numTotalResults);
            // indicates if things are placeholders 
            this._isSearch = Array<undefined>(this._numTotalResults === -1 ? 0 : this._numTotalResults);
            this._isSorted = Array<undefined>(this._numTotalResults === -1 ? 0 : this._numTotalResults);

        }
        for (let i = 0; i < this._numTotalResults; i++) {
            //if the index is out of the window then put a placeholder in
            //should ones that have already been found get set to placeholders?
            if (i < startIndex || i > endIndex) {
                if (this._isSearch[i] !== "placeholder") {
                    this._isSearch[i] = "placeholder";
                    this._isSorted[i] = "placeholder";
                    this._visibleElements[i] = <div className="searchBox-placeholder" key={`searchBox-placeholder-${i}`}>Loading...</div>;
                }
            }
            else {
                if (this._isSearch[i] !== "search") {
                    let result: [Doc, string[], string[]] | undefined = undefined;
                    if (i >= this._results.length) {
                        this.getResults(StrCast(this.layoutDoc._searchString));
                        if (i < this._results.length) result = this._results[i];
                        if (result) {
                            const highlights = Array.from([...Array.from(new Set(result[1]).values())]);
                            let lines = new List<string>(result[2]);
                            result[0]._height = 46;
                            result[0].lines = lines;
                            result[0].highlighting = highlights.join(", ");
                            highlights.forEach((item) => headers.add(item));
                            this._visibleDocuments[i] = result[0];
                            this._isSearch[i] = "search";
                            console.log(result[0]);
                            Doc.AddDocToList(this.dataDoc, this.props.fieldKey, result[0]);
                            this.children++;
                        }
                    }
                    else {
                        result = this._results[i];
                        if (result) {
                            const highlights = Array.from([...Array.from(new Set(result[1]).values())]);
                            let lines = new List<string>(result[2]);
                            highlights.forEach((item) => headers.add(item));
                            result[0]._height = 46;
                            result[0].lines = lines;
                            result[0].highlighting = highlights.join(", ");
                            if (i < this._visibleDocuments.length) {
                                this._visibleDocuments[i] = result[0];
                                this._isSearch[i] = "search";
                                Doc.AddDocToList(this.dataDoc, this.props.fieldKey, result[0]);
                                this.children++;
                            }
                        }
                    }
                }
            }
        }
        let schemaheaders: SchemaHeaderField[] = [];
        this.headerscale = headers.size;
        headers.forEach((item) => schemaheaders.push(new SchemaHeaderField(item, "#f1efeb")))
        this.headercount = schemaheaders.length;
        this.props.Document._schemaHeaders = new List<SchemaHeaderField>(schemaheaders);
        if (this._maxSearchIndex >= this._numTotalResults) {
            this._visibleElements.length = this._results.length;
            this._visibleDocuments.length = this._results.length;
            this._isSearch.length = this._results.length;
        }
    }
    @observable headercount: number = 0;
    @observable headerscale: number = 0;

    findCommonElements(arr2: string[]) {
        let arr1 = ["layout", "data"];
        return arr1.some(item => arr2.includes(item))
    }

    @computed
    get resFull() { return this._numTotalResults <= 8; }

    @computed
    get resultHeight() { return this._numTotalResults * 70; }

    //if true, any keywords can be used. if false, all keywords are required.
    @action.bound
    handleWordQueryChange = async () => {
        this._collectionStatus = !this._collectionStatus;
        if (this._collectionStatus) {
            let doc = await Cast(this.props.Document.keywords, Doc)
            doc!.backgroundColor = "grey";

        }
        else {
            let doc = await Cast(this.props.Document.keywords, Doc)
            doc!.backgroundColor = "black";
        }
    }

    @action.bound
    handleNodeChange = async () => {
        this._nodeStatus = !this._nodeStatus;

        if (this._nodeStatus) {
            this.expandSection(`node${this.props.Document[Id]}`);
            let doc = await Cast(this.props.Document.nodes, Doc)
            doc!.backgroundColor = "grey";

        }
        else {
            this.collapseSection(`node${this.props.Document[Id]}`);
            let doc = await Cast(this.props.Document.nodes, Doc)
            doc!.backgroundColor = "black";
        }
    }

    @action.bound
    handleKeyChange = async () => {
        this._keyStatus = !this._keyStatus;
        if (this._keyStatus) {
            this.expandSection(`key${this.props.Document[Id]}`);
            let doc = await Cast(this.props.Document.keys, Doc)
            doc!.backgroundColor = "grey";
        }
        else {
            this.collapseSection(`key${this.props.Document[Id]}`);
            let doc = await Cast(this.props.Document.keys, Doc)
            doc!.backgroundColor = "black";
        }
    }

    @action.bound
    handleFilterChange = () => {
        this._filterOpen = !this._filterOpen;
        if (this._filterOpen) {
            this.expandSection(`filterhead${this.props.Document[Id]}`);
            document.getElementById(`filterhead${this.props.Document[Id]}`)!.style.padding = "5";
            console.log(this.props.Document[Id])
        }
        else {
            this.collapseSection(`filterhead${this.props.Document[Id]}`);


        }
    }

    @computed
    get menuHeight() {
        return document.getElementById("hi")?.clientHeight;
    }


    collapseSection(thing: string) {
        const id = this.props.Document[Id];
        const element = document.getElementById(thing)!;
        // get the height of the element's inner content, regardless of its actual size
        const sectionHeight = element.scrollHeight;

        // temporarily disable all css transitions
        const elementTransition = element.style.transition;
        element.style.transition = '';

        // on the next frame (as soon as the previous style change has taken effect),
        // explicitly set the element's height to its current pixel height, so we 
        // aren't transitioning out of 'auto'
        requestAnimationFrame(function () {
            element.style.height = sectionHeight + 'px';
            element.style.transition = elementTransition;

            // on the next frame (as soon as the previous style change has taken effect),
            // have the element transition to height: 0
            requestAnimationFrame(function () {
                element.style.height = 0 + 'px';
                thing === `filterhead${id}` ? document.getElementById(`filterhead${id}`)!.style.padding = "0" : null;
            });
        });

        // mark the section as "currently collapsed"
        element.setAttribute('data-collapsed', 'true');
    }

    expandSection(thing: string) {
        const element = document.getElementById(thing)!;
        // get the height of the element's inner content, regardless of its actual size
        const sectionHeight = element.scrollHeight;

        // have the element transition to the height of its inner content
        element.style.height = sectionHeight + 'px';

        // when the next css transition finishes (which should be the one we just triggered)
        element.addEventListener('transitionend', function handler(e) {
            // remove this event listener so it only gets triggered once
            console.log("autoset");
            element.removeEventListener('transitionend', handler);

            // remove "height" from the element's inline styles, so it can return to its initial value
            element.style.height = "auto";
            //element.style.height = undefined;
        });

        // mark the section as "currently not collapsed"
        element.setAttribute('data-collapsed', 'false');

    }

    autoset(thing: string) {
        const element = document.getElementById(thing)!;
        console.log("autoset");
        element.removeEventListener('transitionend', function (e) { });

        // remove "height" from the element's inline styles, so it can return to its initial value
        element.style.height = "auto";
        //element.style.height = undefined;
    }

    @action.bound
    updateTitleStatus = async () => {
        this._titleFieldStatus = !this._titleFieldStatus;
        if (this._titleFieldStatus) {
            let doc = await Cast(this.props.Document.title, Doc)
            doc!.backgroundColor = "grey";
        }
        else {
            let doc = await Cast(this.props.Document.title, Doc)
            doc!.backgroundColor = "black";
        }
    }

    @action.bound
    updateAuthorStatus = async () => {
        this._authorFieldStatus = !this._authorFieldStatus;
        if (this._authorFieldStatus) {
            let doc = await Cast(this.props.Document.author, Doc)
            doc!.backgroundColor = "grey";
        }
        else {
            let doc = await Cast(this.props.Document.author, Doc)
            doc!.backgroundColor = "black";
        }
    }

    @action.bound
    updateDeletedStatus = async () => {
        this._deletedDocsStatus = !this._deletedDocsStatus;
        if (this._deletedDocsStatus) {
            let doc = await Cast(this.props.Document.deleted, Doc)
            doc!.backgroundColor = "grey";
        }
        else {
            let doc = await Cast(this.props.Document.deleted, Doc)
            doc!.backgroundColor = "black";
        }
    }

    addButtonDoc = (doc: Doc) => Doc.AddDocToList(CurrentUserUtils.UserDocument.expandingButtons as Doc, "data", doc);
    remButtonDoc = (doc: Doc) => Doc.RemoveDocFromList(CurrentUserUtils.UserDocument.expandingButtons as Doc, "data", doc);
    moveButtonDoc = (doc: Doc, targetCollection: Doc | undefined, addDocument: (document: Doc) => boolean) => this.remButtonDoc(doc) && addDocument(doc);

    @action.bound
    updateIcon = async (icon: string) => {
        if (this._icons.includes(icon)) {
            _.pull(this._icons, icon);
            let cap = icon.charAt(0).toUpperCase() + icon.slice(1)
            console.log(cap);
            let doc = await Cast(this.props.Document[cap], Doc)
            doc!.backgroundColor = "black";
        }
        else {
            this._icons.push(icon);
            let cap = icon.charAt(0).toUpperCase() + icon.slice(1)
            let doc = await Cast(this.props.Document[cap], Doc)
            doc!.backgroundColor = "grey";
        }
    }

    @action.bound
    checkIcons = async () => {
        for (let i = 0; i < this._allIcons.length; i++) {

            let cap = this._allIcons[i].charAt(0).toUpperCase() + this._allIcons[i].slice(1)
            let doc = await Cast(this.props.Document[cap], Doc)
            if (this._icons.includes(this._allIcons[i])) {
                doc!.backgroundColor = "grey";
            }
            else {
                doc!.backgroundColor = "black";
            }
        }
    }

    @computed get searchItemTemplate() { return Cast(Doc.UserDoc().searchItemTemplate, Doc, null); }

    getTransform = () => {
        return this.props.ScreenToLocalTransform().translate(-5, -65);// listBox padding-left and pres-box-cont minHeight
    }
    panelHeight = () => {
        return this.props.PanelHeight();
    }
    selectElement = (doc: Doc) => {
        //this.gotoDocument(this.childDocs.indexOf(doc), NumCasst(this.layoutDoc._itemIndex));
    }

    addDocument = (doc: Doc) => {
        return null;
    }

    @observable filter = false;


    //Make id layour document
    render() {
        this.props.Document._chromeStatus === "disabled";
        this.props.Document._searchDoc = true;
        let cols = Cast(this.props.Document._schemaHeaders, listSpec(SchemaHeaderField), []).length;
        let length = 0;
        cols > 5 ? length = 1076 : length = cols * 205 + 51;
        let height = 0;
        let rows = this.children;
        rows > 8 ? height = 31 + 31 * 8 : height = 31 * rows + 31;
        return (
            <div style={{ pointerEvents: "all" }} className="searchBox-container">
                <div className="searchBox-bar">
                    {/* <span className="searchBox-barChild searchBox-collection" onPointerDown={SetupDrag(this.collectionRef, () => StrCast(this.layoutDoc._searchString) ? this.startDragCollection() : undefined)} ref={this.collectionRef} title="Drag Results as Collection">
                        <FontAwesomeIcon icon="object-group" size="lg" />
                    </span> */}
                    <div style={{ position: "absolute", left: 15 }}>{Doc.CurrentUserEmail}</div>
                    <FontAwesomeIcon onPointerDown={SetupDrag(this.collectionRef, () => StrCast(this.layoutDoc._searchString) ? this.startDragCollection() : undefined)} icon={"search"} size="lg" style={{ position: "relative", left: 24, padding: 1 }} />
                    <input value={this.newsearchstring} autoComplete="off" onChange={this.onChange} type="text" placeholder="Search..." id="search-input" ref={this.inputRef}
                        className="searchBox-barChild searchBox-input" onPointerDown={this.openSearch} onKeyPress={this.enter} onFocus={this.openSearch}
                        style={{ paddingLeft: 23, width: this._searchbarOpen ? "200px" : "200px" }} />
                </div>
                <div style={{ zIndex: 2000 }}>
                    {this._searchbarOpen === true ?
                        <div style={{ display: "flex", justifyContent: "center", }}>
                            <div style={{
                                width: cols > 0 ? length : 253,
                                height: 25,
                                borderColor: "#9c9396",
                                border: "1px solid",
                                borderRadius: "0.3em",
                                borderBottom: this.open === false ? "1px solid" : "none",
                                position: "absolute",
                                background: "rgb(241, 239, 235)",
                                top: 29
                            }}>
                                <form className="beta" style={{ justifyContent: "space-evenly", display: "flex" }}>
                                    <div className="checkbox" style={{ margin: 0 }}>
                                        <label style={{ fontSize: 12, marginTop: 6 }}>
                                            <input style={{ marginLeft: -16, marginTop: -1, color: this.scale == false ? "black" : "grey" }} checked={this.filter === true} onChange={() => {
                                                runInAction(() => {
                                                    if (this.scale === false) {
                                                        this.filter = !this.filter;
                                                        if (this.filter === true && this.currentSelectedCollection !== undefined) {
                                                            this.currentSelectedCollection.props.Document._searchDocs = new List<Doc>(this.docsforfilter);
                                                            this.currentSelectedCollection.props.Document._docFilters = new List<string>(Cast(this.props.Document._docFilters, listSpec("string"), []));
                                                            this.props.Document.selectedDoc = this.currentSelectedCollection.props.Document;
                                                        }
                                                        else if (this.filter === false && this.currentSelectedCollection !== undefined) {
                                                            this.currentSelectedCollection.props.Document._searchDocs = new List<Doc>([]);
                                                            this.currentSelectedCollection.props.Document._docFilters = undefined;
                                                            this.props.Document.selectedDoc = undefined;
                                                        }
                                                    }
                                                })
                                            }} type="checkbox"></input>
                                            Filter
                                        </label>
                                    </div>
                                    <div style={{ display: "contents" }}>
                                        <div className="radio" style={{ margin: 0 }}>
                                            <label style={{ fontSize: 12, marginTop: 6 }} >
                                                <input type="radio" style={{ marginLeft: -16, marginTop: -1 }} checked={this.scale === false} onChange={() => {
                                                    runInAction(() => {
                                                        this.scale = !this.scale;
                                                        this.dataDoc[this.fieldKey] = new List<Doc>([]);
                                                        if (this.currentSelectedCollection !== undefined) {
                                                            this.currentSelectedCollection.props.Document._docFilters = undefined;
                                                            this.currentSelectedCollection.props.Document._searchDocs = undefined;
                                                            this.currentSelectedCollection = undefined;
                                                        }
                                                        this.submitSearch();
                                                    })
                                                }} />
                                        Current collection
                                    </label>
                                        </div>
                                        <div className="radio" style={{ margin: 0 }}>
                                            <label style={{ fontSize: 12, marginTop: 6 }} >
                                                <input style={{ marginLeft: -16, marginTop: -1 }} type="radio" checked={this.scale === true} onChange={() => {
                                                    runInAction(() => {
                                                        this.scale = !this.scale;
                                                        this.dataDoc[this.fieldKey] = new List<Doc>([]);
                                                        this.filter = false;
                                                        if (this.currentSelectedCollection !== undefined) {
                                                            this.currentSelectedCollection.props.Document._docFilters = undefined;
                                                            this.currentSelectedCollection.props.Document._searchDocs = undefined;
                                                            this.currentSelectedCollection = undefined;
                                                        }
                                                        this.submitSearch();
                                                    })
                                                }} />
                                            Workspace
                                    </label>
                                        </div>
                                    </div>
                                </form>
                            </div>
                            {this.noresults === "" ? <div style={{ display: this.open === true ? "contents" : "none" }}> <CollectionView {...this.props}
                                Document={this.props.Document}
                                moveDocument={returnFalse}
                                removeDocument={returnFalse}
                                PanelHeight={this.open === true ? () => height : () => 0}
                                PanelWidth={this.open === true ? () => length : () => 0}
                                PanelPosition={"absolute"}
                                overflow={cols > 5 || rows > 8 ? true : false}
                                focus={this.selectElement}
                                ScreenToLocalTransform={Transform.Identity}
                            /></div> : <div style={{ display: "flex", justifyContent: "center" }}><div style={{ height: 200, top: 54, width: 250, position: "absolute", backgroundColor: "rgb(241, 239, 235)", display: "flex", justifyContent: "center", alignItems: "center", border: "black 1px solid", }}>
                                <div>{this.noresults}</div>
                            </div></div>}
                        </div> : undefined}
                </div>

                <div className="searchBox-results" onScroll={this.resultsScrolled} style={{
                    display: this._resultsOpen ? "flex" : "none",
                    height: this.resFull ? "auto" : this.resultHeight,
                    overflow: "visibile" // this.resFull ? "auto" : "visible"
                }} ref={this._resultsRef}>
                </div>
            </div >
        );
    }
}

Scripting.addGlobal(function lookupSearchBoxField(container: Doc, field: string, data: Doc) {
    // if (field === 'indexInPres') return DocListCast(container[StrCast(container.presentationFieldKey)]).indexOf(data);
    // if (field === 'presCollapsedHeight') return container._viewType === CollectionViewType.Schema ? 50 : 46;
    // if (field === 'presStatus') return container.presStatus;
    // if (field === '_itemIndex') return container._itemIndex;
    if (field == "query") return container._searchString;
    return undefined;
});

