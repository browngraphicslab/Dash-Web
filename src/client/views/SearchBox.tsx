import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action, runInAction } from 'mobx';
import { Utils } from '../../Utils';
import { MessageStore } from '../../server/Message';
import "./SearchBox.scss";
import { faSearch, faObjectGroup } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { library } from '@fortawesome/fontawesome-svg-core';
// const app = express();
// import * as express from 'express';
import { Search } from '../../server/Search';
import * as rp from 'request-promise';
import { SearchItem } from './SearchItem';
import { isString } from 'util';
import { constant } from 'async';
import { DocServer } from '../DocServer';
import { Doc } from '../../new_fields/Doc';
import { Id } from '../../new_fields/FieldSymbols';
import { DocumentManager } from '../util/DocumentManager';
import { SetupDrag } from '../util/DragManager';
import { Docs } from '../documents/Documents';
import { RouteStore } from '../../server/RouteStore';
import { NumCast } from '../../new_fields/Types';

library.add(faSearch);
library.add(faObjectGroup);

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
        let maxy = 300;
        for (const doc of docs) {
            doc.x = x;
            doc.y = y;
            doc.width = 200;
            doc.height = 200 * NumCast(doc.nativeHeight) / NumCast(doc.nativeWidth, 1);
            maxy = Math.max(doc.height, maxy);
            x += 250;
            if (x > 1000) {
                maxy = 300;
                x = 0;
                y += maxy + 25;
            }
        }
        return Docs.FreeformDocument(docs, { width: 400, height: 400, panX: 175, panY: 175, backgroundColor: "grey", title: `Search Docs: "${this.searchString}"` });
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
                        {/* <button className="searchBox-barChild searchBox-filter" onClick={this.toggleFilterDisplay}>Filter</button> */}
                        {/* <FontAwesomeIcon icon="search" size="lg" className="searchBox-barChild searchBox-submit" /> */}
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
                    </div>

                    </div>
                ) : null}
            </div>
        );
    }
}