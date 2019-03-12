import React = require("react");
import { ContextMenuItem, ContextMenuProps } from "./ContextMenuItem";
import { observable, action } from "mobx";
import { observer } from "mobx-react";
import "./ContextMenu.scss"

@observer
export class ContextMenu extends React.Component {
    static Instance: ContextMenu

    @observable private _items: Array<ContextMenuProps> = [{ description: "test", event: (e: React.MouseEvent) => e.preventDefault() }];
    @observable private _pageX: number = 0;
    @observable private _pageY: number = 0;
    @observable private _display: string = "none";
    @observable private _searchString: string = "";


    private ref: React.RefObject<HTMLDivElement>;

    constructor(props: Readonly<{}>) {
        super(props);

        this.ref = React.createRef()

        ContextMenu.Instance = this;
    }

    @action
    clearItems() {
        this._items = []
        this._display = "none"
    }

    @action
    addItem(item: ContextMenuProps) {
        if (this._items.indexOf(item) === -1) {
            this._items.push(item);
        }
        console.log(`After adding, there are ${this._items.length} items`);
    }

    getItems() {
        return this._items;
    }

    @action
    displayMenu(x: number, y: number) {
        this._pageX = x
        this._pageY = y

        this._searchString = "";

        this._display = "flex"
    }

    intersects = (x: number, y: number): boolean => {
        if (this.ref.current && this._display !== "none") {
            if (x >= this._pageX && x <= this._pageX + this.ref.current.getBoundingClientRect().width) {
                if (y >= this._pageY && y <= this._pageY + this.ref.current.getBoundingClientRect().height) {
                    return true;
                }
            }
        }
        return false;
    }

    render() {
        return (
            <div className="contextMenu-cont" style={{ left: this._pageX, top: this._pageY, display: this._display }} ref={this.ref}>
                <input className="contextMenu-item" type="text" placeholder="Search . . ." value={this._searchString} onChange={this.onChange}></input>
                {this._items.filter(prop => {
                    return prop.description.toLowerCase().indexOf(this._searchString.toLowerCase()) !== -1;
                }).map(prop => {
                    return <ContextMenuItem {...prop} key={prop.description} />
                })}
            </div>
        )
    }

    @action
    onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this._searchString = e.target.value;
    }
}