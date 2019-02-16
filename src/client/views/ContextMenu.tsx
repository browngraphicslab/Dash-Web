import React = require("react");
import { ContextMenuItem, ContextMenuProps } from "./ContextMenuItem";
import { observable } from "mobx";
import { observer } from "mobx-react";
import "./ContextMenu.scss"

@observer
export class ContextMenu extends React.Component {
    static Instance: ContextMenu

    @observable private _items: Array<ContextMenuProps> = [{ description: "test", event: (e: React.MouseEvent) => e.preventDefault() }];
    @observable private _pageX: number = 0;
    @observable private _pageY: number = 0;
    @observable private _display: string = "none";

    private ref: React.RefObject<HTMLDivElement>;

    constructor(props: Readonly<{}>) {
        super(props);

        this.ref = React.createRef()

        ContextMenu.Instance = this;
    }

    clearItems() {
        this._items = []
        this._display = "none"
    }

    addItem(item: ContextMenuProps) {
        if (this._items.indexOf(item) === -1) {
            this._items.push(item);
        }
    }

    getItems() {
        return this._items;
    }

    displayMenu(x: number, y: number) {
        this._pageX = x
        this._pageY = y

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
                <input className="contextMenu-item" type="text" id="mySearch" placeholder="Search . . ." onKeyUp={this.search}></input>
                {this._items.map(prop => {
                    return <ContextMenuItem {...prop} key={prop.description} />
                })}
            </div>
        )
    }

    search() {
        let input = document.getElementById("mySearch");
        let filter = (input as HTMLSelectElement).value.toUpperCase();
        let li = document.getElementById("options");
        let a = (li as HTMLSelectElement).getElementsByTagName("div");
        for (let i = 0; i < a.length; i++) {
            let txtValue = a[i].textContent || a[i].innerText;
            if (txtValue.toUpperCase().indexOf(filter) > -1) {
                a[i].style.display = "";
            }
            else {
                a[i].style.display = "none";
            }
        }
    }
}