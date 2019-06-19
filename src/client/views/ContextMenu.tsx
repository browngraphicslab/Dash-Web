import React = require("react");
import { ContextMenuItem, ContextMenuProps } from "./ContextMenuItem";
import { observable, action, computed } from "mobx";
import { observer } from "mobx-react";
import "./ContextMenu.scss";
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
    @observable private _display: boolean = false;
    @observable private _searchString: string = "";
    // afaik displaymenu can be called before all the items are added to the menu, so can't determine in displayMenu what the height of the menu will be
    @observable private _yRelativeToTop: boolean = true;

    private _searchRef = React.createRef<HTMLInputElement>();

    private ref: React.RefObject<HTMLDivElement>;

    constructor(props: Readonly<{}>) {
        super(props);

        this.ref = React.createRef();

        ContextMenu.Instance = this;
    }

    @action
    clearItems() {
        this._items = [];
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

        this._display = true;

        if (this._searchRef.current) {
            this._searchRef.current.focus();
        }
    }

    @action
    closeMenu = () => {
        this.clearItems();
        this._display = false;
    }

    @computed get filteredItems() {
        const searchString = this._searchString.toLowerCase().split(" ");
        const matches = (descriptions: string[]): boolean => {
            return searchString.every(s => descriptions.some(desc => desc.includes(s)));
        };
        const createGroupHeader = (contents: any) => {
            return (
                <div className="contextMenu-group">
                    <div className="contextMenu-description">{contents}</div>
                </div>
            );
        };
        const createItem = (item: ContextMenuProps) => <ContextMenuItem {...item} key={item.description} closeMenu={this.closeMenu} />;
        const flattenItems = (items: ContextMenuProps[], groupFunc: (contents: any) => JSX.Element, getPath: () => string[]) => {
            let eles: JSX.Element[] = [];

            for (const item of items) {
                const description = item.description.toLowerCase();
                const path = [...getPath(), description];
                if ("subitems" in item) {
                    const children = flattenItems(item.subitems, contents => groupFunc(<>{item.description} -> {contents}</>), () => path);
                    if (children.length || matches(path)) {
                        eles.push(groupFunc(item.description));
                        eles = eles.concat(children);
                    }
                } else {
                    if (!matches(path)) {
                        continue;
                    }
                    eles.push(createItem(item));
                }
            }

            return eles;
        };
        return flattenItems(this._items, createGroupHeader, () => []);
    }

    @computed get menuItems() {
        if (!this._searchString) {
            return this._items.map(item => <ContextMenuItem {...item} key={item.description} closeMenu={this.closeMenu} />);
        }
        return this.filteredItems;
    }

    render() {
        if (!this._display) {
            return null;
        }
        let style = this._yRelativeToTop ? { left: this._pageX, top: this._pageY } :
            { left: this._pageX, bottom: this._pageY };

        return (
            <div className="contextMenu-cont" style={style} ref={this.ref}>
                <span>
                    <span className="icon-background">
                        <FontAwesomeIcon icon="search" size="lg" />
                    </span>
                    <input className="contextMenu-item contextMenu-description" type="text" placeholder="Search . . ." value={this._searchString} onChange={this.onChange} ref={this._searchRef} autoFocus />
                </span>
                {this.menuItems}
            </div>
        );
    }

    @action
    onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this._searchString = e.target.value;
    }
}