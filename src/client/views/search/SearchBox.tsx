import { library } from '@fortawesome/fontawesome-svg-core';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable, runInAction, IReactionDisposer, reaction } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import * as rp from 'request-promise';
import { Doc } from '../../../fields/Doc';
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
import { CurrentUserUtils } from  '../../util/CurrentUserUtils';

import { CollectionDockingView } from '../collections/CollectionDockingView';
import { ScriptField } from '../../../fields/ScriptField';
import { PrefetchProxy } from '../../../fields/Proxy';
import { List } from '../../../fields/List';
import { faSearch, faFilePdf, faFilm, faImage, faObjectGroup, faStickyNote, faMusic, faLink, faChartBar, faGlobeAsia, faBan, faVideo, faCaretDown } from '@fortawesome/free-solid-svg-icons';
import { Transform } from '../../util/Transform';
import { MainView } from "../MainView";
import { Scripting,_scriptingGlobals } from '../../util/Scripting';
import { CollectionView, CollectionViewType } from '../collections/CollectionView';
import { ViewBoxBaseComponent } from "../DocComponent";
import { documentSchema } from "../../../fields/documentSchemas";
import { makeInterface, createSchema } from '../../../fields/Schema';
import { listSpec } from '../../../fields/Schema';
import * as _ from "lodash";
import { checkIfStateModificationsAreAllowed } from 'mobx/lib/internal';


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

export interface filterData{
    deletedDocsStatus: boolean;
    authorFieldStatus: boolean;
    titleFieldStatus:boolean;
    basicWordStatus:boolean;
    icons: string[];
}

type SearchBoxDocument = makeInterface<[typeof documentSchema, typeof searchSchema]>;
const SearchBoxDocument = makeInterface(documentSchema, searchSchema);

//React.Component<SearchProps> 
@observer
export class SearchBox extends ViewBoxBaseComponent<FieldViewProps, SearchBoxDocument>(SearchBoxDocument) {

    @computed get _searchString() { return this.layoutDoc.searchQuery; }
    @computed set _searchString(value) { this.layoutDoc.searchQuery=(value); }
    @observable private _resultsOpen: boolean = false;
    @observable private _searchbarOpen: boolean = false;
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

    private new_buckets: { [characterName: string]: number} = {};
    //if true, any keywords can be used. if false, all keywords are required.
    //this also serves as an indicator if the word status filter is applied
    @observable private _basicWordStatus: boolean = false;
    @observable private _nodeStatus: boolean = false;
    @observable private _keyStatus: boolean = false;

    @observable private newAssign: boolean = true;

    constructor(props: any) {
        
        super(props);
        SearchBox.Instance = this;
        if (!_scriptingGlobals.hasOwnProperty("handleNodeChange")){
        Scripting.addGlobal(this.handleNodeChange);
        }
        if (!_scriptingGlobals.hasOwnProperty("handleKeyChange")){
            Scripting.addGlobal(this.handleKeyChange);
        }
        if (!_scriptingGlobals.hasOwnProperty("handleWordQueryChange")){
            Scripting.addGlobal(this.handleWordQueryChange);
        }
        if (!_scriptingGlobals.hasOwnProperty("updateIcon")){
            Scripting.addGlobal(this.updateIcon);
        }
        if (!_scriptingGlobals.hasOwnProperty("updateTitleStatus")){
            Scripting.addGlobal(this.updateTitleStatus);
        }
        if (!_scriptingGlobals.hasOwnProperty("updateAuthorStatus")){
            Scripting.addGlobal(this.updateAuthorStatus);
        }
        if (!_scriptingGlobals.hasOwnProperty("updateDeletedStatus")){
            Scripting.addGlobal(this.updateDeletedStatus);
        }


        this.resultsScrolled = this.resultsScrolled.bind(this);

       new PrefetchProxy(Docs.Create.SearchItemBoxDocument({ title: "search item template", 
       backgroundColor: "transparent", _xMargin: 5, _height: 46, isTemplateDoc: true, isTemplateForField: "data" }));


        if (!this.searchItemTemplate) { // create exactly one presElmentBox template to use by any and all presentations.
            Doc.UserDoc().searchItemTemplate = new PrefetchProxy(Docs.Create.SearchItemBoxDocument({ title: "search item template", backgroundColor: "transparent", _xMargin: 5, _height: 46, isTemplateDoc: true, isTemplateForField: "data" }));
            // this script will be called by each presElement to get rendering-specific info that the PresBox knows about but which isn't written to the PresElement
            // this is a design choice -- we could write this data to the presElements which would require a reaction to keep it up to date, and it would prevent
            // the preselement docs from being part of multiple presentations since they would all have the same field, or we'd have to keep per-presentation data
            // stored on each pres element.  
            (this.searchItemTemplate as Doc).lookupField = ScriptField.MakeFunction("lookupSearchBoxField(container, field, data)",
                { field: "string", data: Doc.name, container: Doc.name });
        }
    }
    @observable setupButtons =false;
    componentDidMount = () => {
        if (this.setupButtons==false){
            this.setupDocTypeButtons();
            this.setupKeyButtons();
            this.setupDefaultButtons();
        runInAction(()=>this.setupButtons==true);
    }
        if (this.inputRef.current) {
            this.inputRef.current.focus();
            runInAction( () => {this._searchbarOpen = true});
        }
        if (this.rootDoc.searchQuery&& this.newAssign) {
            const sq = this.rootDoc.searchQuery;
            runInAction(() => {

            // this._deletedDocsStatus=this.props.filterQuery!.deletedDocsStatus;
            // this._authorFieldStatus=this.props.filterQuery!.authorFieldStatus
            // this._titleFieldStatus=this.props.filterQuery!.titleFieldStatus;
            // this._basicWordStatus=this.props.filterQuery!.basicWordStatus;
            // this._icons=this.props.filterQuery!.icons;
            this.newAssign=false;
            });
            runInAction(() => {
                this.layoutDoc._searchString = StrCast(sq);
                this.submitSearch();
            });
        }
    };


    @action
    getViews = (doc: Doc) => SearchUtil.GetViewsOfDocument(doc)

    @action.bound
    onChange(e: React.ChangeEvent<HTMLInputElement>) {
        this.layoutDoc._searchString = e.target.value;

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
            if (this._icons!==this._allIcons){
            runInAction(()=>{this.expandedBucket=false});
            }
            this.submitSearch();
        }
    }

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
        const blockedTypes:string[]= ["preselement","docholder","collection","search","searchitem", "script", "fonticonbox", "button", "label"];
        docs.forEach(doc => {
            const layoutresult = Cast(doc.type, "string");
            if (layoutresult && !blockedTypes.includes(layoutresult)){
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
        console.log(selectedDocs);
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


    @observable expandedBucket:boolean=false;
    @action
    submitSearch = async (reset?:boolean) => {
        this.checkIcons();
        if (reset){
            this.layoutDoc._searchString="";
        }
        this.dataDoc[this.fieldKey] = new List<Doc>([]);
        this.buckets=[];
        this.new_buckets={};
        const query = StrCast(this.layoutDoc._searchString);
        this.getFinalQuery(query);
        this._results = [];
        this._resultsSet.clear();
        this._isSearch = [];
        this._isSorted=[];
        this._visibleElements = [];
        this._visibleDocuments = [];
        console.log(this._timeout);
        
        if (this._timeout){clearTimeout(this._timeout); this._timeout=undefined};
        this._timeout= setTimeout(()=>{
            console.log("Resubmitting search");
            this.submitSearch();
        }, 10000);

        if (query !== "") {
            this._endIndex = 12;
            this._maxSearchIndex = 0;
            this._numTotalResults = -1;
            await this.getResults(query);
            runInAction(() => {
                this._resultsOpen = true;
                this._searchbarOpen = true;
                this._openNoResults = true;
                this.resultsScrolled();

            });
        }
    }
    @observable _timeout:any=undefined;
    
    @observable firststring: string = "";
    @observable secondstring: string = "";

    @observable bucketcount:number[]=[];

    @action private makenewbuckets(){
        console.log("new");
        let highcount=0;
        let secondcount=0;
        this.firststring="";
        this.secondstring="";
        this.buckets=[];
        this.bucketcount=[];
        this.dataDoc[this.fieldKey] = new List<Doc>([]);
        for (var key in this.new_buckets){
            if (this.new_buckets[key]>highcount){
                secondcount===highcount;
                this.secondstring=this.firststring;
                highcount=this.new_buckets[key];
                this.firststring= key;
            }
            else if (this.new_buckets[key]>secondcount){
                secondcount=this.new_buckets[key];
                this.secondstring= key;
            }
        }

        let bucket = Docs.Create.StackingDocument([],{ _viewType:CollectionViewType.Stacking,title: `default bucket`});
        bucket._viewType === CollectionViewType.Stacking;
        bucket._height=185;
        bucket.bucketfield = "results";
        bucket.isBucket=true;
        Doc.AddDocToList(this.dataDoc, this.props.fieldKey, bucket);
        this.buckets!.push(bucket);
        this.bucketcount[0]=0;
        
        if (this.firststring!==""){
        let firstbucket = Docs.Create.StackingDocument([],{ _viewType:CollectionViewType.Stacking,title: this.firststring });
        firstbucket._height=185;

        firstbucket._viewType === CollectionViewType.Stacking;
        firstbucket.bucketfield = this.firststring;
        firstbucket.isBucket=true;
        Doc.AddDocToList(this.dataDoc, this.props.fieldKey, firstbucket);
        this.buckets!.push(firstbucket);
        this.bucketcount[1]=0;

        }

        if (this.secondstring!==""){
        let secondbucket = Docs.Create.StackingDocument([],{ _viewType:CollectionViewType.Stacking,title: this.secondstring });
        secondbucket._height=185;
        secondbucket._viewType === CollectionViewType.Stacking;
        secondbucket.bucketfield = this.secondstring;
        secondbucket.isBucket=true;
        Doc.AddDocToList(this.dataDoc, this.props.fieldKey, secondbucket);
        this.buckets!.push(secondbucket);
        this.bucketcount[2]=0;
        }

        let webbucket = Docs.Create.StackingDocument([],{ _viewType:CollectionViewType.Stacking,title: this.secondstring });
        webbucket._height=185;
        webbucket._viewType === CollectionViewType.Stacking;
        webbucket.bucketfield = "webs";
        webbucket.isBucket=true;
        const textDoc = Docs.Create.WebDocument(`https://bing.com/search?q=${this.layoutDoc._searchString}`, {
                    _width: 200,  _nativeHeight: 962, _nativeWidth: 800, isAnnotating: false,
                    title: "bing", UseCors: true
                });
        Doc.AddDocToList(this.dataDoc, this.props.fieldKey, webbucket);
        Doc.AddDocToList(webbucket, this.props.fieldKey, textDoc);


    }

    @observable buckets:Doc[]|undefined;

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
                this._curRequest = SearchUtil.Search(query, true, {fq: this.filterQuery, start: this._maxSearchIndex, rows: this.NumResults, hl: true, "hl.fl": "*",}).then(action(async (res: SearchUtil.DocSearchResult) => {
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
                        filteredDocs.forEach((doc,i) => {
                            const index = this._resultsSet.get(doc);
                            const highlight = highlights[doc[Id]];
                            const line = lines.get(doc[Id]) || [];
                            const hlights = highlight ? Object.keys(highlight).map(key => key.substring(0, key.length - 2)) : [];
                            if (this.findCommonElements(hlights)){
                            }
                            else{
                                const layoutresult = Cast(doc.type, "string");
                                if (layoutresult){
                                if(this.new_buckets[layoutresult]===undefined){
                                    this.new_buckets[layoutresult]=1;
                                }
                                else {
                                    this.new_buckets[layoutresult]=this.new_buckets[layoutresult]+1;
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
            if (this._numTotalResults>3 && this.expandedBucket===false){
            this.makenewbuckets();
            }
            this.resultsScrolled();
            res();
        });
        return this.lockPromise;
    }

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
        const filter : filterData = {
            deletedDocsStatus: this._deletedDocsStatus,
            authorFieldStatus: this._authorFieldStatus,
            titleFieldStatus: this._titleFieldStatus,
            basicWordStatus: this._basicWordStatus,
            icons: this._icons,
        }
        return Docs.Create.SearchDocument({ _autoHeight: true, _viewType: CollectionViewType.Stacking , title: StrCast(this.layoutDoc._searchString), filterQuery: filter, searchQuery: StrCast(this.layoutDoc._searchString) });
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
        this._visibleDocuments=[];
        this._numTotalResults = -1;
        this._endIndex = -1;
        this._curRequest = undefined;
    }

    @action
    resultsScrolled = (e?: React.UIEvent<HTMLDivElement>) => {
        if (!this._resultsRef.current) return;

        const scrollY = e ? e.currentTarget.scrollTop : this._resultsRef.current ? this._resultsRef.current.scrollTop : 0;
        const itemHght = 53;
        const startIndex = Math.floor(Math.max(0, scrollY / itemHght));
        //const endIndex = Math.ceil(Math.min(this._numTotalResults - 1, startIndex + (this._resultsRef.current.getBoundingClientRect().height / itemHght)));
        const endIndex= 30;
        this._endIndex = endIndex === -1 ? 12 : endIndex;
        this._endIndex=30;
        if ((this._numTotalResults === 0 || this._results.length === 0) && this._openNoResults) {
            this._visibleElements = [<div className="no-result">No Search Results</div>];
            //this._visibleDocuments= Docs.Create.
            let noResult= Docs.Create.TextDocument("",{title:"noResult"})
            noResult.isBucket =false;
            Doc.AddDocToList(this.dataDoc, this.props.fieldKey, noResult);
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
                    this._isSorted[i]="placeholder";
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
                            result[0]._height=46;
                            result[0].lines=lines;
                            result[0].highlighting=highlights.join(", ");
                            this._visibleDocuments[i] = result[0];
                            this._isSearch[i] = "search";           
                            if (this._numTotalResults>3 && this.expandedBucket===false){
                                let doctype = StrCast(result[0].type);
                                console.log(doctype);
                                if (doctype=== this.firststring){
                                if (this.bucketcount[1]<3){
                                result[0].parent= this.buckets![1];
                                Doc.AddDocToList(this.buckets![1], this.props.fieldKey, result[0]);
                                this.bucketcount[1]+=1;
                                }
                                }
                                else if (doctype=== this.secondstring){
                                if (this.bucketcount[2]<3){
                                result[0].parent= this.buckets![2];
                                Doc.AddDocToList(this.buckets![2], this.props.fieldKey, result[0]);
                                this.bucketcount[2]+=1;
                                }
                                }
                                else if (this.bucketcount[0]<3){
                                //Doc.AddDocToList(this.buckets![0], this.props.fieldKey, result[0]);
                                //this.bucketcount[0]+=1;
                                Doc.AddDocToList(this.dataDoc, this.props.fieldKey, result[0]);
                                }    
                            }
                            else {
                                Doc.AddDocToList(this.dataDoc, this.props.fieldKey, result[0]);
                            }
                    }
                    }
                    else {
                        result = this._results[i];
                        if (result) {
                            const highlights = Array.from([...Array.from(new Set(result[1]).values())]);
                            let lines = new List<string>(result[2]);
                            result[0]._height=46;
                            result[0].lines= lines;
                            result[0].highlighting=highlights.join(", ");
                            if(i<this._visibleDocuments.length){
                            this._visibleDocuments[i]=result[0];
                            this._isSearch[i] = "search";
                            if (this._numTotalResults>3 && this.expandedBucket===false){

                                if (StrCast(result[0].type)=== this.firststring){
                                if (this.bucketcount[1]<3){
                                result[0].parent= this.buckets![1];
                                Doc.AddDocToList(this.buckets![1], this.props.fieldKey, result[0]);
                                this.bucketcount[1]+=1;
                                }
                                }
                                else if (StrCast(result[0].type)=== this.secondstring){
                                if (this.bucketcount[2]<3){
                                result[0].parent= this.buckets![2];
                                Doc.AddDocToList(this.buckets![2], this.props.fieldKey, result[0]);
                                this.bucketcount[2]+=1;
                                }
                                }
                                else if (this.bucketcount[0]<3){
                                //Doc.AddDocToList(this.buckets![0], this.props.fieldKey, result[0]);
                                //this.bucketcount[0]+=1;
                                Doc.AddDocToList(this.dataDoc, this.props.fieldKey, result[0]);
                                }    
                            }
                            else {
                                Doc.AddDocToList(this.dataDoc, this.props.fieldKey, result[0]);
                            }
                        }
                        }
                    }
                }
            }
        }
        if (this._numTotalResults>3 && this.expandedBucket===false){
        if (this.buckets![0]){
        this.buckets![0]._height = this.bucketcount[0]*55 + 25;
        }
        if (this.buckets![1]){
        this.buckets![1]._height = this.bucketcount[1]*55 + 25;
        }
        if (this.buckets![2]){  
        this.buckets![2]._height = this.bucketcount[2]*55 + 25;
        }
    }
        if (this._maxSearchIndex >= this._numTotalResults) {
            this._visibleElements.length = this._results.length;
            this._visibleDocuments.length = this._results.length;
            this._isSearch.length = this._results.length;
        }
    }

    findCommonElements(arr2:string[]) { 
        let arr1= ["layout", "data"];
        return arr1.some(item => arr2.includes(item)) 
    } 
    
    @computed
    get resFull() { return this._numTotalResults <= 8; }

    @computed
    get resultHeight() { return this._numTotalResults * 70; }

    //if true, any keywords can be used. if false, all keywords are required.
    @action.bound
    handleWordQueryChange =  async() => {
        this._collectionStatus = !this._collectionStatus;
        if (this._collectionStatus) {
            let doc = await Cast(this.props.Document.keywords, Doc)
            doc!.backgroundColor= "grey";

        }
        else {
            let doc = await Cast(this.props.Document.keywords, Doc)
            doc!.backgroundColor= "black";
        }
    }

    @action.bound
    handleNodeChange = async () => {
        this._nodeStatus = !this._nodeStatus;

        if (this._nodeStatus) {
            this.expandSection(`node${this.props.Document[Id]}`);
            let doc = await Cast(this.props.Document.nodes, Doc)
            doc!.backgroundColor= "grey";

        }
        else {
            this.collapseSection(`node${this.props.Document[Id]}`);
            let doc = await Cast(this.props.Document.nodes, Doc)
            doc!.backgroundColor= "black";
        }
    }

    @action.bound
    handleKeyChange = async () => {
        this._keyStatus = !this._keyStatus;
        if (this._keyStatus) {
            this.expandSection(`key${this.props.Document[Id]}`);
            let doc = await Cast(this.props.Document.keys, Doc)
            doc!.backgroundColor= "grey";
        }
        else {
            this.collapseSection(`key${this.props.Document[Id]}`);
            let doc = await Cast(this.props.Document.keys, Doc)
            doc!.backgroundColor= "black";
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
    updateTitleStatus= async () =>{ this._titleFieldStatus = !this._titleFieldStatus; 
        if (this._titleFieldStatus){
            let doc = await Cast(this.props.Document.title, Doc)
            doc!.backgroundColor= "grey";
        }
        else{
            let doc = await Cast(this.props.Document.title, Doc)
            doc!.backgroundColor= "black";
        }
    }

    @action.bound
    updateAuthorStatus=async () => { this._authorFieldStatus = !this._authorFieldStatus; 
    if (this._authorFieldStatus){
        let doc = await Cast(this.props.Document.author, Doc)
        doc!.backgroundColor= "grey";
    }
    else{
        let doc = await Cast(this.props.Document.author, Doc)
        doc!.backgroundColor= "black";
    }
    }

    @action.bound
    updateDeletedStatus=async() =>{ this._deletedDocsStatus = !this._deletedDocsStatus; 
        if (this._deletedDocsStatus){
            let doc = await Cast(this.props.Document.deleted, Doc)
            doc!.backgroundColor= "grey";
        }
        else{
            let doc = await Cast(this.props.Document.deleted, Doc)
            doc!.backgroundColor= "black";
        }
    }

    addButtonDoc = (doc: Doc) => Doc.AddDocToList(CurrentUserUtils.UserDocument.expandingButtons as Doc, "data", doc);
    remButtonDoc = (doc: Doc) => Doc.RemoveDocFromList(CurrentUserUtils.UserDocument.expandingButtons as Doc, "data", doc);
    moveButtonDoc = (doc: Doc, targetCollection: Doc | undefined, addDocument: (document: Doc) => boolean) => this.remButtonDoc(doc) && addDocument(doc);
    
    @computed get docButtons() {
        const nodeBtns = this.props.Document.nodeButtons;
        let width = () => NumCast(this.props.Document._width);
        // if (StrCast(this.props.Document.title)==="sidebar search stack"){
            width = MainView.Instance.flyoutWidthFunc;

        // }   
        if (nodeBtns instanceof Doc) {
            return <div id="hi" style={{height:"100px",}}>
                <DocumentView
                docFilters={returnEmptyFilter}
                Document={nodeBtns}
                DataDoc={undefined}
                LibraryPath={emptyPath}
                addDocument={undefined}
                addDocTab={returnFalse}
                rootSelected={returnTrue}
                pinToPres={emptyFunction}
                onClick={undefined}
                removeDocument={undefined}
                ScreenToLocalTransform={this.getTransform}
                ContentScaling={returnOne}
                PanelWidth={width}
                PanelHeight={() => 100}
                renderDepth={0}
                backgroundColor={returnEmptyString}
                focus={emptyFunction}
                parentActive={returnTrue}
                whenActiveChanged={emptyFunction}
                bringToFront={emptyFunction}
                ContainingCollectionView={undefined}
                ContainingCollectionDoc={undefined}
                NativeHeight={()=>100}
                NativeWidth={width}
            />
            </div>;
        }
        return (null);
    }

    @computed get keyButtons() {
        const nodeBtns = this.props.Document.keyButtons;
        let width = () => NumCast(this.props.Document._width);
        // if (StrCast(this.props.Document.title)==="sidebar search stack"){
            width = MainView.Instance.flyoutWidthFunc;
        // }
        if (nodeBtns instanceof Doc) {
            return <div id="hi" style={{height:"35px",}}>
                <DocumentView
                docFilters={returnEmptyFilter}
                Document={nodeBtns}
                DataDoc={undefined}
                LibraryPath={emptyPath}
                addDocument={undefined}
                addDocTab={returnFalse}
                rootSelected={returnTrue}
                pinToPres={emptyFunction}
                onClick={undefined}
                removeDocument={undefined}
                ScreenToLocalTransform={this.getTransform}
                ContentScaling={returnOne}
                PanelWidth={width}
                PanelHeight={() => 100}
                renderDepth={0}
                backgroundColor={returnEmptyString}
                focus={emptyFunction}
                parentActive={returnTrue}
                whenActiveChanged={emptyFunction}
                bringToFront={emptyFunction}
                ContainingCollectionView={undefined}
                ContainingCollectionDoc={undefined}
                NativeHeight={()=>100}
                NativeWidth={width}
            />
            </div>;
        }
        return (null);
    }

    @computed get defaultButtons() {
        const defBtns = this.props.Document.defaultButtons;
        let width = () => NumCast(this.props.Document._width);
        // if (StrCast(this.props.Document.title)==="sidebar search stack"){
            width = MainView.Instance.flyoutWidthFunc;
        // }
        if (defBtns instanceof Doc) {
            return <div id="hi" style={{height:"35px",}}>
                <DocumentView
                docFilters={returnEmptyFilter}

                Document={defBtns}
                DataDoc={undefined}
                LibraryPath={emptyPath}
                addDocument={undefined}
                addDocTab={returnFalse}
                rootSelected={returnTrue}
                pinToPres={emptyFunction}
                onClick={undefined}
                removeDocument={undefined}
                ScreenToLocalTransform={this.getTransform}
                ContentScaling={returnOne}
                PanelWidth={width}
                PanelHeight={() => 100}
                renderDepth={0}
                backgroundColor={returnEmptyString}
                focus={emptyFunction}
                parentActive={returnTrue}
                whenActiveChanged={emptyFunction}
                bringToFront={emptyFunction}
                ContainingCollectionView={undefined}
                ContainingCollectionDoc={undefined}
                NativeHeight={()=>100}
                NativeWidth={width}
            />
            </div>;
        }
        return (null);
    }

    @action.bound
    updateIcon= async (icon: string) =>{
        if (this._icons.includes(icon)){
            _.pull(this._icons, icon);
            let cap = icon.charAt(0).toUpperCase() + icon.slice(1)
            console.log(cap);
            let doc = await Cast(this.props.Document[cap], Doc)
            doc!.backgroundColor= "black";
        }
        else{
            this._icons.push(icon);
            let cap = icon.charAt(0).toUpperCase() + icon.slice(1)
            let doc = await Cast(this.props.Document[cap], Doc)
            doc!.backgroundColor= "grey";
        }
    }

    @action.bound
    checkIcons = async ()=>{
        for (let i=0; i<this._allIcons.length; i++){
        
            let cap = this._allIcons[i].charAt(0).toUpperCase() + this._allIcons[i].slice(1)
            let doc = await Cast(this.props.Document[cap], Doc)
            if (this._icons.includes(this._allIcons[i])){
                doc!.backgroundColor= "grey";
            }
            else{
                doc!.backgroundColor= "black";
            }
    }
    }

    setupDocTypeButtons() {
        let doc = this.props.Document;
        const ficon = (opts: DocumentOptions) => new PrefetchProxy(Docs.Create.FontIconDocument({ ...opts,  
        dropAction: "alias", removeDropProperties: new List<string>(["dropAction"]), _nativeWidth: 100, _nativeHeight: 100, _width: 100,
         _height: 100 })) as any as Doc;
        doc.Audio = ficon({ onClick: ScriptField.MakeScript(`updateIcon("audio")`), title: "music button", icon: "music" });
        doc.Collection  = ficon({ onClick: ScriptField.MakeScript(`updateIcon("collection")`), title: "col button", icon: "object-group" });
        doc.Image = ficon({ onClick: ScriptField.MakeScript(`updateIcon("image")`), title: "image button", icon: "image" });
        doc.Link = ficon({ onClick: ScriptField.MakeScript(`updateIcon("link")`), title: "link button", icon: "link" });
        doc.Pdf = ficon({ onClick: ScriptField.MakeScript(`updateIcon("pdf")`), title: "pdf button", icon: "file-pdf" });
        doc.Rtf = ficon({ onClick: ScriptField.MakeScript(`updateIcon("rtf")`), title: "text button", icon: "sticky-note" });
        doc.Video = ficon({ onClick: ScriptField.MakeScript(`updateIcon("video")`), title: "vid button", icon: "video" });
        doc.Web = ficon({ onClick: ScriptField.MakeScript(`updateIcon("web")`), title: "web button", icon: "globe-asia" });

        let buttons = [doc.None as Doc, doc.Audio as Doc, doc.Collection as Doc, 
        doc.Image as Doc, doc.Link as Doc, doc.Pdf as Doc, doc.Rtf as Doc, doc.Video as Doc, doc.Web as Doc];

        const dragCreators = Docs.Create.MasonryDocument(buttons, {
            _width: 500, backgroundColor:"#121721", _autoHeight: true, columnWidth: 35, ignoreClick: true, lockedPosition: true, _chromeStatus: "disabled", title: "buttons",
            dropConverter: ScriptField.MakeScript("convertToButtons(dragData)", { dragData: DragManager.DocumentDragData.name }), _yMargin: 5
        });
        doc.nodeButtons= dragCreators;
        this.checkIcons()
    }


    setupKeyButtons() {
        let doc = this.props.Document;
        const button = (opts: DocumentOptions) => new PrefetchProxy( Docs.Create.ButtonDocument({...opts,
            _width: 35, _height: 30,
            borderRounding: "16px", border:"1px solid grey", color:"white", hovercolor: "rgb(170, 170, 163)", letterSpacing: "2px",
            _fontSize: 7,
        }))as any as Doc;
        doc.title=button({ backgroundColor:"grey", title: "Title", onClick:ScriptField.MakeScript("updateTitleStatus(self)")});
        doc.deleted=button({ title: "Deleted", onClick:ScriptField.MakeScript("updateDeletedStatus(self)")});
        doc.author = button({ backgroundColor:"grey", title: "Author", onClick:ScriptField.MakeScript("updateAuthorStatus(self)")});
        let buttons = [doc.title as Doc, doc.deleted as Doc, doc.author as Doc];

        const dragCreators = Docs.Create.MasonryDocument(buttons, {
            _width: 500, backgroundColor:"#121721", _autoHeight: true, columnWidth: 50, ignoreClick: true, lockedPosition: true, _chromeStatus: "disabled", title: "buttons",_yMargin: 5
            //dropConverter: ScriptField.MakeScript("convertToButtons(dragData)", { dragData: DragManager.DocumentDragData.name }), 
        });
        doc.keyButtons= dragCreators;
    }

    setupDefaultButtons() {
        let doc = this.props.Document;
        const button = (opts: DocumentOptions) => new PrefetchProxy( Docs.Create.ButtonDocument({...opts,
            _width: 35, _height: 30,
            borderRounding: "16px", border:"1px solid grey", color:"white", 
            //hovercolor: "rgb(170, 170, 163)", 
            letterSpacing: "2px",
            _fontSize: 7,
        }))as any as Doc;
        doc.keywords=button({ title: "Keywords", onClick:ScriptField.MakeScript("handleWordQueryChange(self)")});
        doc.keys=button({ title: "Keys", onClick:ScriptField.MakeScript(`handleKeyChange(self)`)});
        doc.nodes = button({ title: "Nodes", onClick:ScriptField.MakeScript("handleNodeChange(self)")});
        let buttons = [doc.keywords as Doc, doc.keys as Doc, doc.nodes as Doc];
        const dragCreators = Docs.Create.MasonryDocument(buttons, {
            _width: 500, backgroundColor:"#121721", _autoHeight: true, columnWidth: 60, ignoreClick: true, lockedPosition: true, _chromeStatus: "disabled", title: "buttons",_yMargin: 5
            //dropConverter: ScriptField.MakeScript("convertToButtons(dragData)", { dragData: DragManager.DocumentDragData.name }), 
        });
        doc.defaultButtons= dragCreators;
    }
    @computed get searchItemTemplate() { return Cast(Doc.UserDoc().searchItemTemplate, Doc, null); }

    childLayoutTemplate = () => this.layoutDoc._viewType === CollectionViewType.Stacking ? this.searchItemTemplate: undefined;
    getTransform = () => {
    return this.props.ScreenToLocalTransform().translate(-5, -65);// listBox padding-left and pres-box-cont minHeight
    }
    panelHeight = () => {
        return this.props.PanelHeight() - 50;
    }
    selectElement = (doc: Doc) => {
        //this.gotoDocument(this.childDocs.indexOf(doc), NumCasst(this.layoutDoc._itemIndex));
    }

    addDocument = (doc: Doc) => {
        return null;
    }
    //Make id layour document
    render() {
        if (this.expandedBucket  === true){
            this.props.Document._gridGap=5;
        }
        else {
            this.props.Document._gridGap=10;
        }
        this.props.Document._searchDoc=true;

        return (
            <div style={{pointerEvents:"all"}}className="searchBox-container">

                <div className="searchBox-bar">
                    <span className="searchBox-barChild searchBox-collection" onPointerDown={SetupDrag(this.collectionRef, () => StrCast(this.layoutDoc._searchString) ? this.startDragCollection() : undefined)} ref={this.collectionRef} title="Drag Results as Collection">
                        <FontAwesomeIcon icon="object-group" size="lg" />
                    </span>
                    <input value={StrCast(this.layoutDoc._searchString)} onChange={this.onChange} type="text" placeholder="Search..." id="search-input" ref={this.inputRef}
                        className="searchBox-barChild searchBox-input" onPointerDown={this.openSearch} onKeyPress={this.enter} onFocus={this.openSearch}
                        style={{ width: this._searchbarOpen ? "500px" : "100px" }} />
                    <button className="searchBox-barChild searchBox-filter" style={{transform:"none"}} title="Advanced Filtering Options" onClick={() => this.handleFilterChange()}><FontAwesomeIcon icon="ellipsis-v" color="white" /></button>
                </div>
                <div id={`filterhead${this.props.Document[Id]}`} className="filter-form" style={this._filterOpen && this._numTotalResults >0 ? {overflow:"visible"} : {overflow:"hidden"}}>
                    <div id={`filterhead2${this.props.Document[Id]}`} className="filter-header"  >
                        {this.defaultButtons}
                    </div>
                    <div id={`node${this.props.Document[Id]}`} className="filter-body" style={this._nodeStatus ? { borderTop: "grey 1px solid" } : { borderTop: "0px" }}>
                        {this.docButtons}
                    </div>
                    <div className="filter-key" id={`key${this.props.Document[Id]}`} style={this._keyStatus ? { borderTop: "grey 1px solid" } : { borderTop: "0px" }}>
                        {this.keyButtons}
                    </div>
                </div>
                <CollectionView {...this.props}
                        Document={this.props.Document}
                        PanelHeight={this.panelHeight}
                        moveDocument={returnFalse}
                        NativeHeight={()=>400}
                        childLayoutTemplate={this.childLayoutTemplate}
                        addDocument={undefined}
                        removeDocument={returnFalse}
                        focus={this.selectElement}
                        ScreenToLocalTransform={Transform.Identity} />
                <div className="searchBox-results" onScroll={this.resultsScrolled} style={{
                    display: this._resultsOpen ? "flex" : "none",
                    height: this.resFull ? "auto" : this.resultHeight,
                    overflow: "visibile" // this.resFull ? "auto" : "visible"
                }} ref={this._resultsRef}>
                </div>
            </div>
        );
    }
}

Scripting.addGlobal(function lookupSearchBoxField(container: Doc, field: string, data: Doc) {
    // if (field === 'indexInPres') return DocListCast(container[StrCast(container.presentationFieldKey)]).indexOf(data);
    // if (field === 'presCollapsedHeight') return container._viewType === CollectionViewType.Stacking ? 50 : 46;
    // if (field === 'presStatus') return container.presStatus;
    // if (field === '_itemIndex') return container._itemIndex;
        if (field == "query") return container._searchString;
    return undefined;
});

