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

library.add(faSearch);

@observer
export class SearchBox extends React.Component {
    @observable
    searchString: string = "";

    @observable private _open: boolean = false;

    @action.bound
    onChange(e: React.ChangeEvent<HTMLInputElement>) {
        this.searchString = e.target.value;

    }

    submitSearch = () => {
        Utils.EmitCallback(Server.Socket, MessageStore.SearchFor, this.searchString, (results: string[]) => {
            for (const result of results) {
                console.log(result);
                //Utils.GetQueryVariable();
            }
        });
    }

    @action
    handleClick = (e: Event): void => {
        var className = (e.target as any).className;
        var id = (e.target as any).id;
        console.log(id);
        //let imgPrev = document.getElementById("img_preview");
        console.log(className);
        if (className !== "filter-button" && className !== "filter-form") {
            console.log("false");
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

                    <input value={this.searchString} onChange={this.onChange} type="text" placeholder="Search.." className="search" />
                    {/* {this._items.filter(prop => prop.description.toLowerCase().indexOf(this._searchString.toLowerCase()) !== -1).
                    map(prop => <ContextMenuItem {...prop} key={prop.description} />)} */}

                    <button className="filter-button" onClick={this.toggleDisplay}> Filter </button>
                    <div className="submit-search" ><FontAwesomeIcon style={{ height: "100%" }} icon="search" size="lg" /></div>
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