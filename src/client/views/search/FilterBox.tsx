import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action } from 'mobx';
import "./SearchBox.scss";
import { faTimes, faCheckCircle, faObjectGroup } from '@fortawesome/free-solid-svg-icons';
import { library } from '@fortawesome/fontawesome-svg-core';
import { Doc } from '../../../new_fields/Doc';
import { Id } from '../../../new_fields/FieldSymbols';
import { DocTypes } from '../../documents/Documents';
import { Cast, StrCast } from '../../../new_fields/Types';
import * as _ from "lodash";
import { ToggleBar } from './ToggleBar';
import { IconBar } from './IconBar';
import { FieldFilters } from './FieldFilters';
import { SelectionManager } from '../../util/SelectionManager';
import { DocumentView } from '../nodes/DocumentView';
import { CollectionFilters } from './CollectionFilters';
import { NaviconButton } from './NaviconButton';
import * as $ from 'jquery';
import "./FilterBox.scss";
import { SearchBox } from './SearchBox';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { CheckBox } from './CheckBox';

library.add(faTimes);
library.add(faCheckCircle);
library.add(faObjectGroup);

export enum Keys {
    TITLE = "title",
    AUTHOR = "author",
    DATA = "data"
}

@observer
export class FilterBox extends React.Component {

    static Instance: FilterBox;
    public _allIcons: string[] = [DocTypes.AUDIO, DocTypes.COL, DocTypes.HIST, DocTypes.IMG, DocTypes.LINK, DocTypes.PDF, DocTypes.TEXT, DocTypes.VID, DocTypes.WEB];

    @observable private _searchTextContents: boolean = false;
    @observable private _searchPdfContents: boolean = false;
    //if true, any keywords can be used. if false, all keywords are required.
    //this also serves as an indicator if the word status filter is applied
    @observable private _basicWordStatus: boolean = true;
    @observable private _filterOpen: boolean = false;
    //if icons = all icons, then no icon filter is applied
    @observable private _icons: string[] = this._allIcons;
    //if all of these are true, no key filter is applied
    @observable private _titleFieldStatus: boolean = true;
    @observable private _authorFieldStatus: boolean = true;
    @observable private _dataFieldStatus: boolean = true;
    //this also serves as an indicator if the collection status filter is applied
    @observable private _collectionStatus = false;
    @observable private _collectionSelfStatus = true;
    @observable private _collectionParentStatus = true;
    @observable private _wordStatusOpen: boolean = false;
    @observable private _typeOpen: boolean = false;
    @observable private _colOpen: boolean = false;
    @observable private _fieldOpen: boolean = false;
    public _pointerTime: number = -1;
    @observable public _resetCounter = 0;
    @observable public _resetBoolean = false;

    constructor(props: Readonly<{}>) {
        super(props);
        FilterBox.Instance = this;
    }

    componentDidMount = () => {
        document.addEventListener("pointerdown", (e) => {
            if (!e.defaultPrevented && e.timeStamp !== this._pointerTime) {
                SearchBox.Instance.closeSearch();
            }
        });
    }

    setupAccordion() {
        $('document').ready(function () {
            const acc = document.getElementsByClassName('filter-header');
            // tslint:disable-next-line: prefer-for-of
            for (let i = 0; i < acc.length; i++) {
                acc[i].addEventListener("click", function (this: HTMLElement) {
                    this.classList.toggle("active");

                    var panel = this.nextElementSibling as HTMLElement;
                    if (panel.style.maxHeight) {
                        panel.style.overflow = "hidden";
                        panel.style.maxHeight = null;
                        panel.style.opacity = "0";
                    } else {
                        setTimeout(() => {
                            panel.style.overflow = "visible";
                        }, 200);
                        setTimeout(() => {
                            panel.style.opacity = "1";
                        }, 50);
                        panel.style.maxHeight = panel.scrollHeight + "px";

                    }
                });
            }
        });
    }

    @action.bound
    minimizeAll() {
        $('document').ready(function () {
            var acc = document.getElementsByClassName('filter-header');

            // tslint:disable-next-line: prefer-for-of
            for (var i = 0; i < acc.length; i++) {
                let classList = acc[i].classList;
                if (classList.contains("active")) {
                    acc[i].classList.toggle("active");
                    var panel = acc[i].nextElementSibling as HTMLElement;
                    panel.style.overflow = "hidden";
                    panel.style.maxHeight = null;
                }
            }
        });
    }

    @action.bound
    resetFilters = () => {
        ToggleBar.Instance.resetToggle();
        IconBar.Instance.selectAll();
        FieldFilters.Instance.resetFieldFilters();
        CollectionFilters.Instance.resetCollectionFilters();
    }

    basicRequireWords(query: string): string {
        let oldWords = query.split(" ");
        let newWords: string[] = [];
        oldWords.forEach(word => {
            let newWrd = "+" + word;
            newWords.push(newWrd);
        });
        query = newWords.join(" ");

        return query;
    }

    basicFieldFilters(query: string, type: string): string {
        let oldWords = query.split(" ");
        let mod = "";

        if (type === Keys.AUTHOR) {
            mod = " author_t:";
        } if (type === Keys.DATA) {
            //TODO
        } if (type === Keys.TITLE) {
            mod = " title_t:";
        }

        let newWords: string[] = [];
        oldWords.forEach(word => {
            let newWrd = mod + word;
            newWords.push(newWrd);
        });

        query = newWords.join(" ");

        return query;
    }

    applyBasicFieldFilters(query: string) {
        let finalQuery = "";

        if (this._titleFieldStatus) {
            finalQuery = finalQuery + this.basicFieldFilters(query, Keys.TITLE);
        }
        if (this._authorFieldStatus) {
            finalQuery = finalQuery + this.basicFieldFilters(query, Keys.AUTHOR);
        }
        if (this._dataFieldStatus) {
            finalQuery = finalQuery + this.basicFieldFilters(query, Keys.DATA);
        }
        return finalQuery;
    }

    get fieldFiltersApplied() { return !(this._dataFieldStatus && this._authorFieldStatus && this._titleFieldStatus); }

    //TODO: basically all of this
    //gets all of the collections of all the docviews that are selected
    //if a collection is the only thing selected, search only in that collection (not its container)
    getCurCollections(): Doc[] {
        let selectedDocs: DocumentView[] = SelectionManager.SelectedDocuments();
        let collections: Doc[] = [];

        selectedDocs.forEach(async element => {
            let layout: string = StrCast(element.props.Document.baseLayout);
            //checks if selected view (element) is a collection. if it is, adds to list to search through
            if (layout.indexOf("Collection") > -1) {
                //makes sure collections aren't added more than once
                if (!collections.includes(element.props.Document)) {
                    collections.push(element.props.Document);
                }
            }
            //gets the selected doc's containing view
            let containingView = element.props.ContainingCollectionView;
            //makes sure collections aren't added more than once
            if (containingView && !collections.includes(containingView.props.Document)) {
                collections.push(containingView.props.Document);
            }
        });

        return collections;
    }

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

        //if should be searched in a specific collection
        if (this._collectionStatus) {
            query = this.addCollectionFilter(query);
            query = query.replace(/\s+/g, ' ').trim();
        }
        return query;
    }

    addCollectionFilter(query: string): string {
        let collections: Doc[] = this.getCurCollections();
        let oldWords = query.split(" ");

        let collectionString: string[] = [];
        collections.forEach(doc => {
            let proto = doc.proto;
            let protoId = (proto || doc)[Id];
            let colString: string = "{!join from=data_l to=id}id:" + protoId + " ";
            collectionString.push(colString);
        });

        let finalColString = collectionString.join(" ");
        finalColString = finalColString.trim();
        return "+(" + finalColString + ")" + query;
    }

    @action
    filterDocsByType(docs: Doc[]) {
        let finalDocs: Doc[] = [];
        docs.forEach(doc => {
            let layoutresult = Cast(doc.type, "string");
            if (!layoutresult || this._icons.includes(layoutresult)) {
                finalDocs.push(doc);
            }
        });
        return finalDocs;
    }

    getABCicon() {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 87.8 87.8" height="35">
                <path d="M25.4 47.9c-1.3 1.3-1.9 2.8-1.9 4.8 0 3.8 2.3 6.1 6.1 6.1 5.1 0 8-3.3 9-6.2 0.2-0.7 0.4-1.4 0.4-2.1v-6.1c-0.1 0-0.1 0-0.2 0C32.2 44.5 27.7 45.6 25.4 47.9z" />
                <path d="M64.5 28.6c-2.2 0-4.1 1.5-4.7 3.8l0 0.2c-0.1 0.3-0.1 0.7-0.1 1.1v3.3c0 0.4 0.1 0.8 0.2 1.1 0.6 2.2 2.4 3.6 4.6 3.6 3.2 0 5.2-2.6 5.2-6.7C69.5 31.8 68 28.6 64.5 28.6z" />
                <path d="M43.9 0C19.7 0 0 19.7 0 43.9s19.7 43.9 43.9 43.9 43.9-19.6 43.9-43.9S68.1 0 43.9 0zM40.1 65.5l-0.5-4c-3 3.1-7.4 4.9-12.1 4.9 -6.8 0-13.6-4.4-13.6-12.8 0-4 1.3-7.4 4-10 4.1-4.1 11.1-6.2 20.8-6.3 0-5.5-2.9-8.4-8.3-8.4 -3.6 0-7.4 1.1-10.2 2.9l-1.1 0.7 -2.4-6.9 0.7-0.4c3.7-2.4 8.9-3.8 14.1-3.8 10.9 0 16.7 6.2 16.7 17.9V54.6c0 4.1 0.2 7.2 0.7 9.7L49 65.5H40.1zM65.5 67.5c1.8 0 3-0.5 4-0.9l0.5-0.2 0.8 3.4 -0.3 0.2c-1 0.5-3 1.1-5.5 1.1 -5.8 0-9.7-4-9.7-9.9 0-6.1 4.3-10.3 10.4-10.3 2.1 0 4 0.5 4.9 1l0.3 0.2 -1 3.5 -0.5-0.3c-0.7-0.4-1.8-0.8-3.7-0.8 -3.7 0-6.1 2.6-6.1 6.6C59.5 64.8 61.9 67.5 65.5 67.5zM65 45.3c-2.5 0-4.5-0.9-5.9-2.7l-0.1 2.3h-3.8l0-0.5c0.1-1.2 0.2-3.1 0.2-4.8V16.7h4.3v10.8c1.4-1.6 3.5-2.5 6-2.5 2.2 0 4.1 0.8 5.5 2.3 1.8 1.8 2.8 4.5 2.8 7.7C73.8 42.1 69.3 45.3 65 45.3z" />
            </svg>
        );
    }

    getTypeIcon() {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 87.8 87.8" height="35">
                <path d="M43.9 0C19.7 0 0 19.7 0 43.9s19.7 43.9 43.9 43.9 43.9-19.6 43.9-43.9S68.1 0 43.9 0zM43.9 12.2c4.1 0 7.5 3.4 7.5 7.5 0 4.1-3.4 7.5-7.5 7.5 -4.1 0-7.5-3.4-7.5-7.5C36.4 15.5 39.7 12.2 43.9 12.2zM11.9 50.4l7.5-13 7.5 13H11.9zM47.6 75.7h-7.5l-3.7-6.5 3.8-6.5h7.5l3.8 6.5L47.6 75.7zM70.7 70.7c-0.2 0.2-0.4 0.3-0.7 0.3s-0.5-0.1-0.7-0.3l-25.4-25.4 -25.4 25.4c-0.2 0.2-0.4 0.3-0.7 0.3s-0.5-0.1-0.7-0.3c-0.4-0.4-0.4-1 0-1.4l25.4-25.4 -25.4-25.4c-0.4-0.4-0.4-1 0-1.4s1-0.4 1.4 0l25.4 25.4 25.4-25.4c0.4-0.4 1-0.4 1.4 0s0.4 1 0 1.4l-25.4 25.4 25.4 25.4C71.1 69.7 71.1 70.3 70.7 70.7zM61.4 51.4v-15h15v15H61.4z" />
            </svg>
        );
    }

    getKeyIcon() {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 87.8 87.8" height="35">
                <path d="M38.5 32.4c0 3.4-2.7 6.1-6.1 6.1 -3.4 0-6.1-2.7-6.1-6.1 0-3.4 2.8-6.1 6.1-6.1C35.8 26.3 38.5 29 38.5 32.4zM87.8 43.9c0 24.2-19.6 43.9-43.9 43.9S0 68.1 0 43.9C0 19.7 19.7 0 43.9 0S87.8 19.7 87.8 43.9zM66.8 60.3L50.2 43.7c-0.5-0.5-0.6-1.2-0.4-1.8 2.4-5.6 1.1-12.1-3.2-16.5 -5.9-5.8-15.4-5.8-21.2 0l0 0c-4.3 4.3-5.6 10.8-3.2 16.5 3.2 7.6 12 11.2 19.7 8 0.6-0.3 1.4-0.1 1.8 0.4l3.1 3.1h3.9c1.2 0 2.2 1 2.2 2.2v3.6h3.6c1.2 0 2.2 1 2.2 2.2v4l1.6 1.6h6.5V60.3z" />
            </svg>
        );
    }

    getColIcon() {
        return (
            <div className="col-icon">
                <FontAwesomeIcon icon={faObjectGroup} size="lg" />
            </div>
        );
    }

    @action.bound
    openFilter = () => {
        this._filterOpen = !this._filterOpen;
        SearchBox.Instance.closeResults();
        this.setupAccordion();
    }

    //if true, any keywords can be used. if false, all keywords are required.
    @action.bound
    handleWordQueryChange = () => { this._basicWordStatus = !this._basicWordStatus; }

    @action.bound
    getBasicWordStatus() { return this._basicWordStatus; }

    @action.bound
    updateIcon(newArray: string[]) { this._icons = newArray; }

    @action.bound
    getIcons(): string[] { return this._icons; }

    stopProp = (e: React.PointerEvent) => {
        e.stopPropagation();
        this._pointerTime = e.timeStamp;
    }

    @action.bound
    public closeFilter() {
        this._filterOpen = false;
    }

    @action.bound
    toggleFieldOpen() { this._fieldOpen = !this._fieldOpen; }

    @action.bound
    toggleColOpen() { this._colOpen = !this._colOpen; }

    @action.bound
    toggleTypeOpen() { this._typeOpen = !this._typeOpen; }

    @action.bound
    toggleWordStatusOpen() { this._wordStatusOpen = !this._wordStatusOpen; }

    @action.bound
    updateTitleStatus(newStat: boolean) { this._titleFieldStatus = newStat; }

    @action.bound
    updateAuthorStatus(newStat: boolean) { this._authorFieldStatus = newStat; }

    @action.bound
    updateDataStatus(newStat: boolean) { this._dataFieldStatus = newStat; }

    @action.bound
    updateCollectionStatus(newStat: boolean) { this._collectionStatus = newStat; }

    @action.bound
    updateSelfCollectionStatus(newStat: boolean) { this._collectionSelfStatus = newStat; }

    @action.bound
    updateParentCollectionStatus(newStat: boolean) { this._collectionParentStatus = newStat; }

    @action.bound
    updateSearchPdfContents(newStat: boolean) { this._searchPdfContents = newStat; }

    @action.bound
    updateSearchTextContents(newStat: boolean) { this._searchTextContents = newStat; }

    getCollectionStatus() { return this._collectionStatus; }
    getSelfCollectionStatus() { return this._collectionSelfStatus; }
    getParentCollectionStatus() { return this._collectionParentStatus; }
    getTitleStatus() { return this._titleFieldStatus; }
    getAuthorStatus() { return this._authorFieldStatus; }
    getDataStatus() { return this._dataFieldStatus; }

    getActiveFilters() {
        console.log(this._authorFieldStatus, this._titleFieldStatus, this._dataFieldStatus);
        return (
            <div className="active-filters">
                {!this._basicWordStatus ? <div className="active-icon container">
                    <div className="active-icon icon">{this.getABCicon()}</div>
                    <div className="active-icon description">Required Words Applied</div>
                </div> : undefined}
                {!(this._icons.length === 9) ? <div className="active-icon container">
                    <div className="active-icon icon">{this.getTypeIcon()}</div>
                    <div className="active-icon description">Type Filters Applied</div>
                </div> : undefined}
                {!(this._authorFieldStatus && this._dataFieldStatus && this._titleFieldStatus) ?
                    <div className="active-icon container">
                        <div className="active-icon icon">{this.getKeyIcon()}</div>
                        <div className="active-icon description">Field Filters Applied</div>
                    </div> : undefined}
                {this._collectionStatus ? <div className="active-icon container">
                    <div className="active-icon icon">{this.getColIcon()}</div>
                    <div className="active-icon description">Collection Filters Active</div>
                </div> : undefined}
            </div>
        );
    }

    getHeader() {
        return (
            <div className="top-filter-header" style={{ display: "flex", width: "100%" }}>
                <div id="header">Filter Search Results</div>
                <div className="close-icon" onClick={this.closeFilter}>
                    <span className="line line-1"></span>
                    <span className="line line-2"></span></div>
            </div>
        );
    }

    getBottomButtons() {
        return (
            <div className="filter-buttons" style={{ display: "flex", justifyContent: "space-around" }}>
                <button className="minimize-filter" onClick={this.minimizeAll}>Minimize All</button>
                <button className="advanced-filter" >Advanced Filters</button>
                <button className="save-filter" >Save Filters</button>
                <button className="reset-filter" onClick={this.resetFilters}>Reset Filters</button>
            </div>
        );
    }

    getTextSpecs() {
        return (
            <div className="text-search-specs">
                <CheckBox updateStatus = {this.updateSearchTextContents} originalStatus={this._searchTextContents} numCount = {2} title={"Search in text contents"} parent = {this} default={false}/>
                <CheckBox updateStatus = {this.updateSearchPdfContents} originalStatus={this._searchPdfContents} numCount = {2} title={"Search in pdf contents"} parent = {this} default={false}/>
            </div>
        )
    }

    // Useful queries:
    // Delegates of a document: {!join from=id to=proto_i}id:{protoId}
    // Documents in a collection: {!join from=data_l to=id}id:{collectionProtoId} //id of collections prototype
    render() {
        return (
            <div>
                <div style={{ display: "flex", flexDirection: "row-reverse" }}>
                    <SearchBox />
                    {this.getActiveFilters()}
                </div>
                {this._filterOpen ? (
                    <div className="filter-form" onPointerDown={this.stopProp} id="filter-form" style={this._filterOpen ? { display: "flex" } : { display: "none" }}>
                        {this.getHeader()}
                        <div className="filter-options">
                            <div className="filter-div">
                                <div className="filter-header">
                                    <div className='filter-title words'>Required words</div>
                                    <div style={{ marginLeft: "auto", display: "flex" }}>
                                        {!this._basicWordStatus ? <div style={{ marginRight: "10px" }}><FontAwesomeIcon className="fontawesome-icon" icon={faCheckCircle} size="lg" /></div> : undefined}
                                        <NaviconButton onClick={this.toggleWordStatusOpen} />
                                    </div>
                                </div>
                                <div className="filter-panel" >
                                    <ToggleBar handleChange={this.handleWordQueryChange} getStatus={this.getBasicWordStatus}
                                        originalStatus={this._basicWordStatus} optionOne={"Include Any Keywords"} optionTwo={"Include All Keywords"} />
                                </div>
                            </div>
                            <div className="filter-div">
                                <div className="filter-header">
                                    <div className="filter-title icon">Filter by type of node</div>
                                    <div style={{ marginLeft: "auto", display: "flex" }}>
                                        {!(this._icons.length === 9) ? <div style={{ marginRight: "10px" }}><FontAwesomeIcon className="fontawesome-icon" icon={faCheckCircle} size="lg" /></div> : undefined}
                                        <NaviconButton onClick={this.toggleTypeOpen} />
                                    </div>
                                </div>
                                <div className="filter-panel">
                                    <IconBar />
                                    {this.getTextSpecs()}
                                    </div>
                            </div>
                            <div className="filter-div">
                                <div className="filter-header">
                                    <div className='filter-title collection'>Search in current collections</div>
                                    <div style={{ marginLeft: "auto", display: "flex" }}>
                                        {this._collectionStatus ? <div style={{ marginRight: "10px" }}><FontAwesomeIcon className="fontawesome-icon" icon={faCheckCircle} size="lg" /></div> : undefined}
                                        <NaviconButton onClick={this.toggleColOpen} />
                                    </div>
                                </div>
                                <div className="filter-panel"><CollectionFilters
                                    updateCollectionStatus={this.updateCollectionStatus} updateParentCollectionStatus={this.updateParentCollectionStatus} updateSelfCollectionStatus={this.updateSelfCollectionStatus}
                                    collectionStatus={this._collectionStatus} collectionParentStatus={this._collectionParentStatus} collectionSelfStatus={this._collectionSelfStatus} /></div>
                            </div>
                            <div className="filter-div">
                                <div className="filter-header">
                                    <div className="filter-title field">Filter by Basic Keys</div>
                                    <div style={{ marginLeft: "auto", display: "flex" }}>
                                        {!(this._authorFieldStatus && this._dataFieldStatus && this._titleFieldStatus) ?
                                            <div style={{ marginRight: "10px" }}><FontAwesomeIcon className="fontawesome-icon" icon={faCheckCircle} size="lg" /></div> : undefined}
                                        <NaviconButton onClick={this.toggleFieldOpen} />
                                    </div>
                                </div>
                                <div className="filter-panel"><FieldFilters
                                    titleFieldStatus={this._titleFieldStatus} dataFieldStatus={this._dataFieldStatus} authorFieldStatus={this._authorFieldStatus}
                                    updateAuthorStatus={this.updateAuthorStatus} updateDataStatus={this.updateDataStatus} updateTitleStatus={this.updateTitleStatus} /> </div>
                            </div>
                        </div>
                        {this.getBottomButtons()}
                    </div>
                ) :
                    undefined}
            </div>
        );
    }
}