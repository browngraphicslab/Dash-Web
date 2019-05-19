import React = require("react");
import { ContextMenuItem, ContextMenuProps } from "./ContextMenuItem";
import { observable, action } from "mobx";
import { observer } from "mobx-react"
import "./ContextMenu.scss"
import { library } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faCircle } from '@fortawesome/free-solid-svg-icons';

library.add(faSearch);
library.add(faCircle);

@observer
export class ContextMenu extends React.Component {
    static Instance: ContextMenu;

    @observable private _items: Array<ContextMenuProps> = [{ description: "test", event: (e: React.MouseEvent) => e.preventDefault(), icon: "smile" }];
    @observable private _pageX: number = 0;
    @observable private _pageY: number = 0;
    @observable private _display: string = "none";
    @observable private _searchString: string = "";
    // afaik displaymenu can be called before all the items are added to the menu, so can't determine in displayMenu what the height of the menu will be
    @observable private _yRelativeToTop: boolean = true;


    private ref: React.RefObject<HTMLDivElement>;

    constructor(props: Readonly<{}>) {
        super(props);

        this.ref = React.createRef();

        ContextMenu.Instance = this;
    }

    @action
    clearItems() {
        this._items = [];
        this._display = "none";
    }

    @action
    addItem(item: ContextMenuProps) {
        if (this._items.indexOf(item) === -1) {
            this._items.push(item);
        }
    }

    getItems() {
        return this._items;
    }

    @action
    displayMenu(x: number, y: number) {
        //maxX and maxY will change if the UI/font size changes, but will work for any amount
        //of items added to the menu
        let maxX = window.innerWidth - 150;
        let maxY = window.innerHeight - ((this._items.length + 1/*for search box*/) * 34 + 30);

        this._pageX = x > maxX ? maxX : x;
        this._pageY = y > maxY ? maxY : y;

        this._searchString = "";

        this._display = "flex";
    }

    intersects = (x: number, y: number): boolean => {
        if (this.ref.current && this._display !== "none") {
            let menuSize = { width: this.ref.current.getBoundingClientRect().width, height: this.ref.current.getBoundingClientRect().height };

            let upperLeft = { x: this._pageX, y: this._yRelativeToTop ? this._pageY : window.innerHeight - (this._pageY + menuSize.height) };
            let bottomRight = { x: this._pageX + menuSize.width, y: this._yRelativeToTop ? this._pageY + menuSize.height : window.innerHeight - this._pageY };

            if (x >= upperLeft.x && x <= bottomRight.x) {
                if (y >= upperLeft.y && y <= bottomRight.y) {
                    return true;
                }
            }
        }
        return false;
    }

    render() {
        let style = this._yRelativeToTop ? { left: this._pageX, top: this._pageY, display: this._display } :
            { left: this._pageX, bottom: this._pageY, display: this._display };


        return (
            <div className="contextMenu-cont" style={style} ref={this.ref}>
                <span>
                    <span className="icon-background">
                        <FontAwesomeIcon icon="circle" size="lg" />
                        <FontAwesomeIcon icon="search" size="lg" />
                    </span>
                    <input className="contextMenu-item" type="text" placeholder="Search . . ." value={this._searchString} onChange={this.onChange} />
                </span>
                {this._items.filter(prop => prop.description.toLowerCase().indexOf(this._searchString.toLowerCase()) !== -1).
                    map(prop => <ContextMenuItem {...prop} key={prop.description} />)}
            </div>
        );
    }

    @action
    onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this._searchString = e.target.value;
    }
}