import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action, runInAction } from 'mobx';
import { Utils } from '../../Utils';
import { MessageStore } from '../../server/Message';
import { Server } from '../Server';
import "./SearchBox.scss";
import { faSearch } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { library } from '@fortawesome/fontawesome-svg-core';
// const app = express();
// import * as express from 'express';
import { Search } from '../../server/Search';
import * as rp from 'request-promise';
import { Document } from '../../fields/Document';
import { SearchItem } from './SearchItem';
import { isString } from 'util';


library.add(faSearch);

@observer
export class SearchBox extends React.Component {
    @observable
    searchString: string = "";

    @observable private _open: boolean = false;
    @observable private _resultsOpen: boolean = false;

    @observable
    private _results: Document[] = [];

    // constructor(props: any) {
    //     super(props);
    //     let searchInput = document.getElementById("input");
    //     if (searchInput) {
    //         // searchInput.addEventListener("keydown", this.onKeyPress)
    //     }
    // }

    // //this is not working?????
    // @action
    // onKeyPress = (e: KeyboardEvent) => {
    //     console.log('things happening')
    //     //Number 13 is the "Enter" key on the keyboard
    //     if (e.keyCode === 13) {
    //         console.log("happi")
    //         // Cancel the default action, if needed
    //         e.preventDefault();
    //         // Trigger the button element with a click
    //         let btn = document.getElementById("submit");
    //         if (btn) {
    //             console.log("yesyesyes")
    //             btn.click();
    //         }
    //     }
    // }

    @action.bound
    onChange(e: React.ChangeEvent<HTMLInputElement>) {
        this.searchString = e.target.value;
    }

    @action
    submitSearch = async () => {

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
            const doc = await Server.GetField(result);
            if (doc instanceof Document) {
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

    render() {
        return (
            <div id="outer">
                <div className="searchBox" id="outer">
                    {/* <input value={this.searchString} onChange={this.onChange} />
                <button onClick={this.submitSearch} /> */}

                    <input value={this.searchString} onChange={this.onChange} type="text" placeholder="Search.." className="search" id="input" />
                    <div style={this._resultsOpen ? { display: "flex" } : { display: "none" }}>
                        {this._results.map(result => <SearchItem doc={result} key={result.Id} />)}
                    </div>
                    <button className="filter-button" onClick={this.toggleDisplay}> Filter </button>
                    <div className="submit-search" id="submit" onClick={this.submitSearch}><FontAwesomeIcon style={{ height: "100%" }} icon="search" size="lg" /></div>
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