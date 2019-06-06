import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action, runInAction } from 'mobx';
import "./SearchBox.scss";
import { faSearch, faFilePdf, faFilm, faImage, faObjectGroup, faStickyNote, faMusic, faLink, faChartBar, faGlobeAsia } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { library } from '@fortawesome/fontawesome-svg-core';
import * as rp from 'request-promise';
import { SearchItem } from './SearchItem';
import { DocServer } from '../DocServer';
import { Doc } from '../../new_fields/Doc';
import { Id } from '../../new_fields/FieldSymbols';
import { SetupDrag } from '../util/DragManager';
import { Docs } from '../documents/Documents';
import { RouteStore } from '../../server/RouteStore';
import { NumCast } from '../../new_fields/Types';
import { SearchUtil } from '../util/SearchUtil';
import * as anime from 'animejs';
// import anime from 'animejs';

library.add(faSearch);
library.add(faObjectGroup);
library.add(faImage);
library.add(faStickyNote);
library.add(faFilePdf);
library.add(faFilm);
library.add(faMusic);
library.add(faLink);
library.add(faChartBar);
library.add(faGlobeAsia);

@observer
export class SearchBox extends React.Component {
    @observable
    searchString: string = "";

    @observable private _open: boolean = false;
    @observable private _resultsOpen: boolean = false;

    @observable
    private _results: Doc[] = [];


    @action.bound
    onChange(e: React.ChangeEvent<HTMLInputElement>) {
        this.searchString = e.target.value;
    }

    @action
    submitSearch = async () => {
        let query = this.searchString;
        //gets json result into a list of documents that can be used
        const results = await this.getResults(query);

        runInAction(() => {
            this._resultsOpen = true;
            this._results = results;
        });

    }

    @action
    getResults = async (query: string) => {
        let response = await rp.get(DocServer.prepend('/search'), {
            qs: {
                query
            }
        });
        let res: string[] = JSON.parse(response);
        const fields = await DocServer.GetRefFields(res);
        const docs: Doc[] = [];
        for (const id of res) {
            const field = fields[id];
            if (field instanceof Doc) {
                docs.push(field);
            }
        }
        return docs;
    }

    public static async convertDataUri(imageUri: string, returnedFilename: string) {
        try {
            let posting = DocServer.prepend(RouteStore.dataUriToImage);
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

    @action
    handleClickFilter = (e: Event): void => {
        var className = (e.target as any).className;
        var id = (e.target as any).id;
        if (className !== "filter-button" && className !== "filter-form") {
            this._open = false;
        }

    }

    @action
    handleClickResults = (e: Event): void => {
        var className = (e.target as any).className;
        var id = (e.target as any).id;
        if (id !== "result") {
            this._resultsOpen = false;
            this._results = [];
        }

    }

    componentWillMount() {
        document.addEventListener('mousedown', this.handleClickFilter, false);
        document.addEventListener('mousedown', this.handleClickResults, false);
    }

    componentWillUnmount() {
        document.removeEventListener('mousedown', this.handleClickFilter, false);
        document.removeEventListener('mousedown', this.handleClickResults, false);
    }

    @action
    toggleFilterDisplay = () => {
        this._open = !this._open;
    }

    enter = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            this.submitSearch();
        }
    }

    collectionRef = React.createRef<HTMLSpanElement>();
    startDragCollection = async () => {
        const results = await this.getResults(this.searchString);
        const docs = results.map(doc => {
            const isProto = Doc.GetT(doc, "isPrototype", "boolean", true);
            if (isProto) {
                return Doc.MakeDelegate(doc);
            } else {
                return Doc.MakeAlias(doc);
            }
        });
        let x = 0;
        let y = 0;
        for (const doc of docs) {
            doc.x = x;
            doc.y = y;
            const size = 200;
            const aspect = NumCast(doc.nativeHeight) / NumCast(doc.nativeWidth, 1);
            if (aspect > 1) {
                doc.height = size;
                doc.width = size / aspect;
            } else if (aspect > 0) {
                doc.width = size;
                doc.height = size * aspect;
            } else {
                doc.width = size;
                doc.height = size;
            }
            doc.zoomBasis = 1;
            x += 250;
            if (x > 1000) {
                x = 0;
                y += 300;
            }
        }
        return Docs.FreeformDocument(docs, { width: 400, height: 400, panX: 175, panY: 175, backgroundColor: "grey", title: `Search Docs: "${this.searchString}"` });
    }

    @action
    getViews = async (doc: Doc) => {
        const results = await SearchUtil.GetViewsOfDocument(doc);
        let toReturn: Doc[] = [];
        await runInAction(() => {
            toReturn = results;
        });
        return toReturn;
    }


    // Useful queries:
    // Delegates of a document: {!join from=id to=proto_i}id:{protoId}
    // Documents in a collection: {!join from=data_l to=id}id:{collectionProtoId}
    render() {
        return (
            <div>
                <div className="searchBox-container">
                    <div className="searchBox-bar">
                        <span onPointerDown={SetupDrag(this.collectionRef, this.startDragCollection)} ref={this.collectionRef}>
                            <FontAwesomeIcon icon="object-group" className="searchBox-barChild" size="lg" />
                        </span>
                        <input value={this.searchString} onChange={this.onChange} type="text" placeholder="Search..."
                            className="searchBox-barChild searchBox-input" onKeyPress={this.enter}
                            style={{ width: this._resultsOpen ? "500px" : undefined }} />
                        <button className="searchBox-barChild searchBox-filter" onClick={this.toggleFilterDisplay}>Filter</button>
                    </div>
                    {this._resultsOpen ? (
                        <div className="searchBox-results">
                            {this._results.map(result => <SearchItem doc={result} key={result[Id]} />)}
                        </div>
                    ) : null}
                </div>
                {this._open ? (
                    <div className="filter-form" id="filter" style={this._open ? { display: "flex" } : { display: "none" }}>
                        <div className="filter-form" id="header">Filter Search Results</div>
                        <div className="filter-form" id="option">
                            filter by collection, key, type of node
                            <div className="required-words">
                                temp for making words required
                            </div>
                            <div className="type-of-node">
                                temp for filtering by a type of node
                                <div className="icon-bar">
                                    {/* hoping to ultimately animate a reorder when an icon is chosen */}
                                    <FontAwesomeIcon style={{ order: 0 }} icon={faFilePdf} size="2x" />
                                    <FontAwesomeIcon style={{ order: 1 }} icon={faChartBar} size="2x" />
                                    <FontAwesomeIcon style={{ order: 2 }} icon={faObjectGroup} size="2x" />
                                    <FontAwesomeIcon style={{ order: 3 }} icon={faImage} size="2x" />
                                    <FontAwesomeIcon style={{ order: 4 }} icon={faFilm} size="2x" />
                                    <FontAwesomeIcon style={{ order: 5 }} icon={faGlobeAsia} size="2x" />
                                    <FontAwesomeIcon style={{ order: 6 }} icon={faLink} size="2x" />
                                    <FontAwesomeIcon style={{ order: 7 }} icon={faMusic} size="2x" />
                                    <FontAwesomeIcon style={{ order: 8 }} icon={faStickyNote} size="2x" />
                                </div>
                            </div>
                            <div className="filter-collection">
                                temp for filtering by collection
                            </div>
                            <div className="where-in-doc">
                                temp for filtering where in doc the keywords are found
                            </div>
                        </div>

                    </div>
                ) : null}
            </div>
        );
    }
}