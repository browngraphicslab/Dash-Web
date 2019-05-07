import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action, runInAction } from 'mobx';
import { Utils } from '../../Utils';
import { MessageStore } from '../../server/Message';
import "./SearchBox.scss";
import { faSearch } from '@fortawesome/free-solid-svg-icons';
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
import { Id } from '../../new_fields/RefField';


library.add(faSearch);

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
        console.log(this.searchString)
    }

    @action
    submitSearch = async () => {
        runInAction(() => this._results = []);
        let query = this.searchString;

        let response = await rp.get('http://localhost:1050/search', {
            qs: {
                query
            }
        });
        let results = JSON.parse(response);

        //gets json result into a list of documents that can be used
        this.getResults(results);

        runInAction(() => { this._resultsOpen = true; });
    }

    @action
    getResults = async (res: string[]) => {
        res.map(async result => {
            const doc = await DocServer.GetRefField(result);
            if (doc instanceof Doc) {
                runInAction(() => this._results.push(doc));
            }
        });
    }

    @action
    handleClick = (e: Event): void => {
        var className = (e.target as any).className;
        var id = (e.target as any).id;
        if (className !== "filter-button" && className !== "filter-form") {
            this._open = false;
        }

    }

    componentWillMount() {
        document.addEventListener('mousedown', this.handleClick, false);
    }

    componentWillUnmount() {
        document.removeEventListener('mousedown', this.handleClick, false);
    }

    @action
    toggleDisplay = () => {
        this._open = !this._open;
    }

    enter = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            this.submitSearch();
        }
    }

    render() {
        return (
            <div id="outer">
                <div className="searchBox" id="outer">

                    <input value={this.searchString} onChange={this.onChange} type="text" placeholder="Search.." className="search" id="input" onKeyPress={this.enter} />
                    <button className="filter-button" onClick={this.toggleDisplay}> Filter </button>
                    <div className="submit-search" id="submit" onClick={this.submitSearch}><FontAwesomeIcon style={{ height: "100%" }} icon="search" size="lg" /></div>
                    <div className="results" style={this._resultsOpen ? { display: "flex" } : { display: "none" }}>
                        {this._results.map(result => <SearchItem doc={result} key={result[Id]} />)}
                    </div>
                </div>
                <div className="filter-form" id="filter" style={this._open ? { display: "flex" } : { display: "none" }}>
                    <div className="filter-form" id="header">Filter Search Results</div>
                    <div className="filter-form" id="option">
                        filter by collection, key, type of node
                    </div>

                </div>
            </div>

        );
    }
}