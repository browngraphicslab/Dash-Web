import { observer } from "mobx-react";
import React = require("react");
import { observable, action, computed, runInAction } from "mobx";
import Measure from "react-measure";
//import "./SearchBoxDoc.scss";
import { Doc, DocListCast, WidthSym, HeightSym } from "../../new_fields/Doc";
import { DocumentIcon } from "./nodes/DocumentIcon";
import { StrCast, NumCast, BoolCast, Cast } from "../../new_fields/Types";
import { returnFalse, emptyFunction, returnEmptyString, returnOne } from "../../Utils";
import { Transform } from "../util/Transform";
import { ObjectField } from "../../new_fields/ObjectField";
import { DocumentView } from "./nodes/DocumentView";
import { DocumentType } from '../documents/DocumentTypes';
import { ClientRecommender } from "../ClientRecommender";
import { DocServer } from "../DocServer";
import { Id } from "../../new_fields/FieldSymbols";
import { FieldView, FieldViewProps } from "./nodes/FieldView";
import { DocumentManager } from "../util/DocumentManager";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { library } from "@fortawesome/fontawesome-svg-core";
import { faBullseye, faLink } from "@fortawesome/free-solid-svg-icons";
import { DocUtils, Docs } from "../documents/Documents";
import { ContentFittingDocumentView } from "./nodes/ContentFittingDocumentView";
import { EditableView } from "./EditableView";
import { SearchUtil } from "../util/SearchUtil";
import { SearchItem } from "./search/SearchItem";
import { FilterBox } from "./search/FilterBox";
import { SearchBox } from "./search/SearchBox";

export interface RecProps {
    documents: { preview: Doc, similarity: number }[];
    node: Doc;

}

library.add(faBullseye, faLink);
export const keyPlaceholder = "Query";

@observer
export class SearchDocBox extends React.Component<FieldViewProps> {

    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(SearchDocBox, fieldKey); }

    // @observable private _display: boolean = false;
    @observable private _pageX: number = 0;
    @observable private _pageY: number = 0;
    @observable private _width: number = 0;
    @observable private _height: number = 0;
    @observable.shallow private _docViews: JSX.Element[] = [];
    // @observable private _documents: { preview: Doc, score: number }[] = [];
    private previewDocs: Doc[] = [];

    constructor(props: FieldViewProps) {
        super(props);
        this.editingMetadata = this.editingMetadata || false;
        //SearchBox.Instance = this;
        this.resultsScrolled = this.resultsScrolled.bind(this);
    }


    @computed
    private get editingMetadata() {
        return BoolCast(this.props.Document.editingMetadata);
    }

    private set editingMetadata(value: boolean) {
        this.props.Document.editingMetadata = value;
    }

    static readonly buffer = 20;

    componentDidMount() {
        runInAction(() => {
            console.log("didit"
            );
            this.query = StrCast(this.props.Document.searchText);
            this.content = (Docs.Create.TreeDocument(DocListCast(Doc.GetProto(this.props.Document).data), { _width: 200, _height: 400, _chromeStatus: "disabled", title: `Search Docs:` + this.query }));

        });
        if (this.inputRef.current) {
            this.inputRef.current.focus();
            runInAction(() => {
                this._searchbarOpen = true;
            });
        }
    }

    @observable
    private content: Doc | undefined;

    @action
    updateKey = async (newKey: string) => {
        this.query = newKey;
        if (newKey.length > 1) {
            let newdocs = await this.getAllResults(this.query);
            let things = newdocs.docs
            console.log(things);
            console.log(this.content);
            runInAction(() => {
                this.content = Docs.Create.TreeDocument(things, { _width: 200, _height: 400, _chromeStatus: "disabled", title: `Search Docs:` + this.query });
            });
            console.log(this.content);
        }


        //this.keyRef.current && this.keyRef.current.setIsFocused(false);
        //this.query.length === 0 && (this.query = keyPlaceholder);
        return true;
    }

    @computed
    public get query() {
        return StrCast(this.props.Document.query);
    }

    public set query(value: string) {
        this.props.Document.query = value;
    }

    @observable private _searchString: string = "";
    @observable private _resultsOpen: boolean = false;
    @observable private _searchbarOpen: boolean = false;
    @observable private _results: [Doc, string[], string[]][] = [];
    private _resultsSet = new Map<Doc, number>();
    @observable private _openNoResults: boolean = false;
    @observable private _visibleElements: JSX.Element[] = [];

    private resultsRef = React.createRef<HTMLDivElement>();
    public inputRef = React.createRef<HTMLInputElement>();

    private _isSearch: ("search" | "placeholder" | undefined)[] = [];
    private _numTotalResults = -1;
    private _endIndex = -1;


    private _maxSearchIndex: number = 0;
    private _curRequest?: Promise<any> = undefined;

    @action
    getViews = async (doc: Doc) => {
        const results = await SearchUtil.GetViewsOfDocument(doc);
        let toReturn: Doc[] = [];
        await runInAction(() => {
            toReturn = results;
        });
        return toReturn;
    }

    @action.bound
    onChange(e: React.ChangeEvent<HTMLInputElement>) {
        this._searchString = e.target.value;

        this._openNoResults = false;
        this._results = [];
        this._resultsSet.clear();
        this._visibleElements = [];
        this._numTotalResults = -1;
        this._endIndex = -1;
        this._curRequest = undefined;
        this._maxSearchIndex = 0;
    }

    enter = async (e: React.KeyboardEvent) => {
        console.log(e.key);
        if (e.key === "Enter") {
            let newdocs = await this.getAllResults(this.query)
            let things = newdocs.docs
            console.log(things);
            this.content = Docs.Create.TreeDocument(things, { _width: 200, _height: 400, _chromeStatus: "disabled", title: `Search Docs: "Results"` });

        }
    }


    @action
    submitSearch = async () => {
        let query = this._searchString;
        query = FilterBox.Instance.getFinalQuery(query);
        this._results = [];
        this._resultsSet.clear();
        this._isSearch = [];
        this._visibleElements = [];
        FilterBox.Instance.closeFilter();

        //if there is no query there should be no result
        if (query === "") {
            return;
        }
        else {
            this._endIndex = 12;
            this._maxSearchIndex = 0;
            this._numTotalResults = -1;
            await this.getResults(query);
        }

        runInAction(() => {
            this._resultsOpen = true;
            this._searchbarOpen = true;
            this._openNoResults = true;
            this.resultsScrolled();
        });
    }

    getAllResults = async (query: string) => {
        return SearchUtil.Search(query, true, { fq: this.filterQuery, start: 0, rows: 10000000 });
    }

    private get filterQuery() {
        const types = FilterBox.Instance.filterTypes;
        const includeDeleted = FilterBox.Instance.getDataStatus();
        return "NOT baseProto_b:true" + (includeDeleted ? "" : " AND NOT deleted_b:true") + (types ? ` AND (${types.map(type => `({!join from=id to=proto_i}type_t:"${type}" AND NOT type_t:*) OR type_t:"${type}" OR type_t:"extension"`).join(" ")})` : "");
    }


    private NumResults = 25;
    private lockPromise?: Promise<void>;
    getResults = async (query: string) => {
        if (this.lockPromise) {
            await this.lockPromise;
        }
        this.lockPromise = new Promise(async res => {
            while (this._results.length <= this._endIndex && (this._numTotalResults === -1 || this._maxSearchIndex < this._numTotalResults)) {
                this._curRequest = SearchUtil.Search(query, true, { fq: this.filterQuery, start: this._maxSearchIndex, rows: this.NumResults, hl: true, "hl.fl": "*" }).then(action(async (res: SearchUtil.DocSearchResult) => {

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
                    const filteredDocs = FilterBox.Instance.filterDocsByType(docs);
                    runInAction(() => {
                        // this._results.push(...filteredDocs);
                        filteredDocs.forEach(doc => {
                            const index = this._resultsSet.get(doc);
                            const highlight = highlights[doc[Id]];
                            const line = lines.get(doc[Id]) || [];
                            const hlights = highlight ? Object.keys(highlight).map(key => key.substring(0, key.length - 2)) : [];
                            if (index === undefined) {
                                this._resultsSet.set(doc, this._results.length);
                                this._results.push([doc, hlights, line]);
                            } else {
                                this._results[index][1].push(...hlights);
                                this._results[index][2].push(...line);
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

    collectionRef = React.createRef<HTMLSpanElement>();
    startDragCollection = async () => {
        const res = await this.getAllResults(FilterBox.Instance.getFinalQuery(this._searchString));
        const filtered = FilterBox.Instance.filterDocsByType(res.docs);
        // console.log(this._results)
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
        //return Docs.Create.TreeDocument(docs, { _width: 200, _height: 400, backgroundColor: "grey", title: `Search Docs: "${this._searchString}"` });
        return Docs.Create.SearchDocument(docs, { _width: 200, _height: 400, searchText: this._searchString, title: `Search Docs: "${this._searchString}"` });
    }

    @action.bound
    openSearch(e: React.SyntheticEvent) {
        e.stopPropagation();
        this._openNoResults = false;
        FilterBox.Instance.closeFilter();
        this._resultsOpen = true;
        this._searchbarOpen = true;
        FilterBox.Instance._pointerTime = e.timeStamp;
    }

    @action.bound
    closeSearch = () => {
        FilterBox.Instance.closeFilter();
        this.closeResults();
        this._searchbarOpen = false;
    }

    @action.bound
    closeResults() {
        this._resultsOpen = false;
        this._results = [];
        this._resultsSet.clear();
        this._visibleElements = [];
        this._numTotalResults = -1;
        this._endIndex = -1;
        this._curRequest = undefined;
    }

    @action
    resultsScrolled = (e?: React.UIEvent<HTMLDivElement>) => {
        if (!this.resultsRef.current) return;
        const scrollY = e ? e.currentTarget.scrollTop : this.resultsRef.current ? this.resultsRef.current.scrollTop : 0;
        const itemHght = 53;
        const startIndex = Math.floor(Math.max(0, scrollY / itemHght));
        const endIndex = Math.ceil(Math.min(this._numTotalResults - 1, startIndex + (this.resultsRef.current.getBoundingClientRect().height / itemHght)));

        this._endIndex = endIndex === -1 ? 12 : endIndex;

        if ((this._numTotalResults === 0 || this._results.length === 0) && this._openNoResults) {
            this._visibleElements = [<div className="no-result">No Search Results</div>];
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
            // indicates if things are placeholders
            this._isSearch = Array<undefined>(this._numTotalResults === -1 ? 0 : this._numTotalResults);
        }

        for (let i = 0; i < this._numTotalResults; i++) {
            //if the index is out of the window then put a placeholder in
            //should ones that have already been found get set to placeholders?
            if (i < startIndex || i > endIndex) {
                if (this._isSearch[i] !== "placeholder") {
                    this._isSearch[i] = "placeholder";
                    this._visibleElements[i] = <div className="searchBox-placeholder" key={`searchBox-placeholder-${i}`}>Loading...</div>;
                }
            }
            else {
                if (this._isSearch[i] !== "search") {
                    let result: [Doc, string[], string[]] | undefined = undefined;
                    if (i >= this._results.length) {
                        this.getResults(this._searchString);
                        if (i < this._results.length) result = this._results[i];
                        if (result) {
                            const highlights = Array.from([...Array.from(new Set(result[1]).values())]);
                            this._visibleElements[i] = <SearchItem doc={result[0]} query={this._searchString} key={result[0][Id]} lines={result[2]} highlighting={highlights} />;
                            this._isSearch[i] = "search";
                        }
                    }
                    else {
                        result = this._results[i];
                        if (result) {
                            const highlights = Array.from([...Array.from(new Set(result[1]).values())]);
                            this._visibleElements[i] = <SearchItem doc={result[0]} query={this._searchString} key={result[0][Id]} lines={result[2]} highlighting={highlights} />;
                            this._isSearch[i] = "search";
                        }
                    }
                }
            }
        }
        if (this._maxSearchIndex >= this._numTotalResults) {
            this._visibleElements.length = this._results.length;
            this._isSearch.length = this._results.length;
        }
    }

    @computed
    get resFull() { return this._numTotalResults <= 8; }

    @computed
    get resultHeight() { return this._numTotalResults * 70; }

    render() {
        const isEditing = this.editingMetadata;
        return (
            <div style={{ pointerEvents: "all" }}>
                <ContentFittingDocumentView {...this.props}
                    Document={this.content}
                    getTransform={this.props.ScreenToLocalTransform}>
                    s</ContentFittingDocumentView>
                <div
                    style={{
                        position: "absolute",
                        right: 0,
                        width: 20,
                        height: 20,
                        background: "black",
                        pointerEvents: "all",
                        opacity: 1,
                        transition: "0.4s opacity ease",
                        zIndex: 99,
                        top: 0,
                    }}
                    title={"Add Metadata"}
                    onClick={action(() => { this.editingMetadata = !this.editingMetadata })}
                />
                <div className="editableclass" onKeyPress={this.enter} style={{ opacity: isEditing ? 1 : 0, pointerEvents: isEditing ? "auto" : "none", transition: "0.4s opacity ease", position: "absolute", top: 0, left: 0, height: 20, width: "-webkit-fill-available" }}>
                    <EditableView
                        contents={this.query}
                        SetValue={this.updateKey}
                        GetValue={() => ""}
                    />
                </div>
            </div >
        );
    }

}