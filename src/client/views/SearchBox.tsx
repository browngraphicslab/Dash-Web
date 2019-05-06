import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action } from 'mobx';
import { Utils } from '../../Utils';
import { MessageStore } from '../../server/Message';
import { Server } from '../Server';
import "./SearchBox.scss";
import { faSearch } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { library } from '@fortawesome/fontawesome-svg-core';
import { actionFieldDecorator } from 'mobx/lib/internal';
// const app = express();
// import * as express from 'express';
import { Search } from '../../server/Search';
import * as rp from 'request-promise';
import { Document } from '../../fields/Document';
import { SearchItem } from './SearchItem';


library.add(faSearch);

@observer
export class SearchBox extends React.Component {
    @observable
    searchString: string = "";

    @observable private _open: boolean = false;

    @observable
    private _results: any;

    constructor(props: any) {
        super(props);
        let searchInput = document.getElementById("input");
        if (searchInput) {
            searchInput.addEventListener("keydown", this.onKeyPress)
        }
    }

    //this is not working?????
    @action
    onKeyPress = (e: KeyboardEvent) => {
        console.log('things happening')
        //Number 13 is the "Enter" key on the keyboard
        if (e.keyCode === 13) {
            console.log("happi")
            // Cancel the default action, if needed
            e.preventDefault();
            // Trigger the button element with a click
            let btn = document.getElementById("submit");
            if (btn) {
                console.log("yesyesyes")
                btn.click();
            }
        }
    }

    @action.bound
    onChange(e: React.ChangeEvent<HTMLInputElement>) {
        this.searchString = e.target.value;
    };

    submitSearch = async () => {

        let query = this.searchString;

        let response = await rp.get('http://localhost:1050/search', {
            qs: {
                query
            }
        });

        let results = JSON.parse(response);

        this._results = results;

        let doc = await Server.GetField(this._results[1]);
        if (doc instanceof Document) {
            console.log("doc");
            console.log(doc.Title);
        }

        // console.log("results")
        // console.log(results);
        // console.log("type")
        // console.log(results.type)
        console.log(this._results);


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
                    {/* {this._items.filter(prop => prop.description.toLowerCase().indexOf(this._searchString.toLowerCase()) !== -1).
                    map(prop => <ContextMenuItem {...prop} key={prop.description} />)} */}
                    {/* {this._results.map(doc => <SearchItem {...doc} key={doc.Title} />)} */}

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