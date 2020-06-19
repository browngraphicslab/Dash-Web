import React = require("react");
import { ContextMenuItem, ContextMenuProps, OriginalMenuProps } from "./ContextMenuItem";
import { observable, action, computed, runInAction, IReactionDisposer, reaction } from "mobx";
import { observer } from "mobx-react";
import "./ContextMenu.scss";
import { library } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faCircle } from '@fortawesome/free-solid-svg-icons';
import Measure from "react-measure";

library.add(faSearch);
library.add(faCircle);

@observer
export class ContextMenu extends React.Component {
    static Instance: ContextMenu;

    @observable private _items: Array<ContextMenuProps> = [];
    @observable private _pageX: number = 0;
    @observable private _pageY: number = 0;
    @observable private _display: boolean = false;
    @observable private _searchString: string = "";
    // afaik displaymenu can be called before all the items are added to the menu, so can't determine in displayMenu what the height of the menu will be
    @observable private _yRelativeToTop: boolean = true;
    @observable selectedIndex = -1;

    @observable private _width: number = 0;
    @observable private _height: number = 0;

    @observable private _mouseX: number = -1;
    @observable private _mouseY: number = -1;
    @observable private _shouldDisplay: boolean = false;
    @observable private _mouseDown: boolean = false;

    private _reactionDisposer?: IReactionDisposer;

    constructor(props: Readonly<{}>) {
        super(props);

        ContextMenu.Instance = this;
    }

    @action
    onPointerDown = (e: PointerEvent) => {
        this._mouseDown = true;
        this._mouseX = e.clientX;
        this._mouseY = e.clientY;
    }
    @action
    onPointerUp = (e: PointerEvent) => {
        this._mouseDown = false;
        const curX = e.clientX;
        const curY = e.clientY;
        if (this._mouseX !== curX || this._mouseY !== curY) {
            this._shouldDisplay = false;
        }

        this._shouldDisplay && (this._display = true);
    }
    componentWillUnmount() {
        document.removeEventListener("pointerdown", this.onPointerDown);
        document.removeEventListener("pointerup", this.onPointerUp);
        this._reactionDisposer && this._reactionDisposer();
    }

    @action
    componentDidMount = () => {
        document.addEventListener("pointerdown", this.onPointerDown);
        document.addEventListener("pointerup", this.onPointerUp);

        this._reactionDisposer = reaction(
            () => this._shouldDisplay,
            () => this._shouldDisplay && !this._mouseDown && runInAction(() => this._display = true)
        );
    }

    @action
    clearItems() {
        this._items = [];
        this._defaultPrefix = "";
        this._defaultItem = undefined;
    }

    _defaultPrefix: string = "";
    _defaultItem: ((name: string) => void) | undefined;

    findByDescription = (target: string, toLowerCase = false) => {
        return this._items.find(menuItem => {
            let reference = menuItem.description;
            toLowerCase && (reference = reference.toLowerCase());
            return reference === target;
        });
    }

    @action
    addItem(item: ContextMenuProps) {
        if (this._items.indexOf(item) === -1) {
            this._items.push(item);
        }
    }
    @action
    moveAfter(item: ContextMenuProps, after: ContextMenuProps) {
        if (this.findByDescription(after.description)) {
            const curInd = this._items.findIndex((i) => i.description === item.description);
            this._items.splice(curInd, 1);
            const afterInd = this._items.findIndex((i) => i.description === after.description);
            this._items.splice(afterInd + 1, 0, item);
        }
    }
    @action
    setDefaultItem(prefix: string, item: (name: string) => void) {
        this._defaultPrefix = prefix;
        this._defaultItem = item;
    }

    getItems() {
        return this._items;
    }

    static readonly buffer = 20;
    get pageX() {
        const x = this._pageX;
        if (x < 0) {
            return 0;
        }
        const width = this._width;
        if (x + width > window.innerWidth - ContextMenu.buffer) {
            return window.innerWidth - ContextMenu.buffer - width;
        }
        return x;
    }

    get pageY() {
        const y = this._pageY;
        if (y < 0) {
            return 0;
        }
        const height = this._height;
        if (y + height > window.innerHeight - ContextMenu.buffer) {
            return window.innerHeight - ContextMenu.buffer - height;
        }
        return y;
    }

    @action
    displayMenu = (x: number, y: number, initSearch = "") => {
        //maxX and maxY will change if the UI/font size changes, but will work for any amount
        //of items added to the menu

        this._pageX = x;
        this._pageY = y;
        this._searchString = initSearch;
        this._shouldDisplay = true;
    }

    @action
    closeMenu = () => {
        this.clearItems();
        this._display = false;
        this._shouldDisplay = false;
    }

    @computed get filteredItems(): (OriginalMenuProps | string[])[] {
        const searchString = this._searchString.toLowerCase().split(" ");
        const matches = (descriptions: string[]): boolean => {
            return searchString.every(s => descriptions.some(desc => desc.toLowerCase().includes(s)));
        };
        const flattenItems = (items: ContextMenuProps[], groupFunc: (groupName: any) => string[]) => {
            let eles: (OriginalMenuProps | string[])[] = [];

            const leaves: OriginalMenuProps[] = [];
            for (const item of items) {
                const description = item.description;
                const path = groupFunc(description);
                if ("subitems" in item) {
                    const children = flattenItems(item.subitems, name => [...groupFunc(description), name]);
                    if (children.length || matches(path)) {
                        eles.push(path);
                        eles = eles.concat(children);
                    }
                } else {
                    if (!matches(path)) {
                        continue;
                    }
                    leaves.push(item);
                }
            }

            eles = [...leaves, ...eles];

            return eles;
        };
        return flattenItems(this._items, name => [name]);
    }

    @computed get flatItems(): OriginalMenuProps[] {
        return this.filteredItems.filter(item => !Array.isArray(item)) as OriginalMenuProps[];
    }

    @computed get filteredViews() {
        const createGroupHeader = (contents: any) => {
            return (
                <div className="contextMenu-group">
                    <div className="contextMenu-description">{contents}</div>
                </div>
            );
        };
        const createItem = (item: ContextMenuProps, selected: boolean) => <ContextMenuItem {...item} key={item.description} closeMenu={this.closeMenu} selected={selected} />;
        let itemIndex = 0;
        return this.filteredItems.map(value => {
            if (Array.isArray(value)) {
                return createGroupHeader(value.join(" -> "));
            } else {
                return createItem(value, itemIndex++ === this.selectedIndex);
            }
        });
    }

    @computed get menuItems() {
        if (!this._searchString) {
            return this._items.map(item => <ContextMenuItem {...item} key={item.description} closeMenu={this.closeMenu} />);
        }
        return this.filteredViews;
    }

    render() {
        if (!this._display) {
            return null;
        }
        const style = this._yRelativeToTop ? { left: this.pageX, top: this.pageY } :
            { left: this.pageX, bottom: this.pageY };

        const contents = (
            <>
                <span className={"search-icon"}>
                    <span className="icon-background">
                        <FontAwesomeIcon icon="search" size="lg" />
                    </span>
                    <input className="contextMenu-item contextMenu-description search" type="text" placeholder="Search Menu..." value={this._searchString} onKeyDown={this.onKeyDown} onChange={this.onChange} autoFocus />
                </span>
                {this.menuItems}
            </>
        );
        return (
            <Measure offset onResize={action((r: any) => { this._width = r.offset.width; this._height = r.offset.height; })}>
                {({ measureRef }) => (
                    <div className="contextMenu-cont" style={style} ref={measureRef}>
                        {contents}
                    </div>
                )
                }
            </Measure>
        );
    }

    @action
    onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            if (this.selectedIndex < this.flatItems.length - 1) {
                this.selectedIndex++;
            }
            e.preventDefault();
        } else if (e.key === "ArrowUp") {
            if (this.selectedIndex > 0) {
                this.selectedIndex--;
            }
            e.preventDefault();
        } else if (e.key === "Enter" || e.key === "Tab") {
            const item = this.flatItems[this.selectedIndex];
            if (item) {
                item.event({ x: this.pageX, y: this.pageY });
            } else if (this._searchString.startsWith(this._defaultPrefix)) {
                this._defaultItem?.(this._searchString.substring(this._defaultPrefix.length));
            }
            this.closeMenu();
            e.preventDefault();
        }
    }

    @action
    onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this._searchString = e.target.value;
        if (!this._searchString) {
            this.selectedIndex = -1;
        }
        else {
            if (this.selectedIndex === -1) {
                this.selectedIndex = 0;
            } else {
                this.selectedIndex = Math.min(this.flatItems.length - 1, this.selectedIndex);
            }
        }
    }
}