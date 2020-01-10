import React = require("react");
import { observer } from "mobx-react";
import { action, observable, computed, IReactionDisposer, reaction, runInAction } from "mobx";
import { RadialMenuItem, RadialMenuProps, OriginalMenuProps } from "./RadialMenuItem";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Measure from "react-measure";
import "./RadialMenu.scss";



@observer
export class RadialMenu extends React.Component {
    static Instance: RadialMenu;
    static readonly buffer = 20;

    constructor(props: Readonly<{}>) {
        super(props);

        RadialMenu.Instance = this;
    }

    @observable private _mouseX: number = -1;
    @observable private _mouseY: number = -1;
    @observable private _shouldDisplay: boolean = false;
    @observable private _mouseDown: boolean = false;
    private _reactionDisposer?: IReactionDisposer;


    @action
    onPointerDown = (e: PointerEvent) => {
        this._mouseDown = true;
        this._mouseX = e.clientX;
        this._mouseY = e.clientY; 
        document.addEventListener("pointermove", this.onPointerMove);
    }

    @observable 
    private _closest:number=-1;

    @action
    onPointerMove = (e: PointerEvent) => {
        const curX = e.clientX;
        const curY = e.clientY;
        const deltX = this._mouseX-curX
        const deltY = this._mouseY-curY
        const scale = Math.hypot(deltY,deltX)

        if (scale <150 && scale > 50){
            const rad = Math.atan2(deltY,deltX)+Math.PI;
            let closest =0;
            let closestval = 999999999;
            for (let x =0; x<this._items.length; x++){
                let curmin= (x/this._items.length)*2*Math.PI;
                if (rad-curmin<closestval && rad-curmin>0){
                    closestval=rad-curmin
                    closest=x;
                }
            }
            this._closest=closest;
        }
        else{
            this._closest=-1;
        }
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
        document.removeEventListener("pointermove", this.onPointerMove);
        if (this._closest!==-1){
            this._items[this._closest].event();
        }
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

    @observable private _pageX: number = 0;
    @observable private _pageY: number = 0;
    @observable private _display: boolean = false;
    @observable private _yRelativeToTop: boolean = true;


    @observable private _width: number = 0;
    @observable private _height: number = 0;


    getItems() {
        return this._items;
    }

    findByDescription = (target: string, toLowerCase = false) => {
        return this._items.find(menuItem => {
            let reference = menuItem.description;
            toLowerCase && (reference = reference.toLowerCase());
            return reference === target;
        });
    }


    @action
    addItem(item: RadialMenuProps) {
        if (this._items.indexOf(item) === -1) {
            this._items.push(item);
        }
    }
    
    @observable 
    private _items: Array<RadialMenuProps> = [];

    @action
    displayMenu = (x: number, y: number) => {
        //maxX and maxY will change if the UI/font size changes, but will work for any amount
        //of items added to the menu

        this._pageX = x;
        this._pageY = y;
        this._shouldDisplay = true;
    }

    get pageX() {
        const x = this._pageX;
        if (x < 0) {
            return 0;
        }
        const width = this._width;
        if (x + width > window.innerWidth - RadialMenu.buffer) {
            return window.innerWidth - RadialMenu.buffer - width;
        }
        return x;
    }

    get pageY() {
        const y = this._pageY;
        if (y < 0) {
            return 0;
        }
        const height = this._height;
        if (y + height > window.innerHeight - RadialMenu.buffer) {
            return window.innerHeight - RadialMenu.buffer - height;
        }
        return y;
    }

    @computed get menuItems() {
        return this._items.map((item,index) => <RadialMenuItem {...item} key={item.description} closeMenu={this.closeMenu} max={this._items.length} min={index} selected={this._closest} />);
    }

    @action
    closeMenu = () => {
        this.clearItems();
        this._display = false;
        this._shouldDisplay = false;
    }

    @action
    openMenu = () => {
        this._shouldDisplay;
        this._display = true;
    }

    @action
    clearItems() {
        this._items = [];
    }

    render() {
        if (!this._display) {
            return null;
        }
        const style = this._yRelativeToTop ? { left: this._mouseX-150, top: this._mouseY-150 } :
            { left: this._mouseX-150, bottom: this._mouseY+150 };

        const contents = (
            <>
                {this.menuItems}
            </>
        );
        // return (
        //     <Measure offset onResize={action((r: any) => { this._width = r.offset.width; this._height = r.offset.height; })}>
        //         {({ measureRef }) => (
        //             <div className="radialMenu-cont" style={style} ref={measureRef}>
        //                 {contents}
        //             </div>
        //         )
        //         }
        //     </Measure>
        // );
        return (

                    <div className="radialMenu-cont" style={style}>
                        {contents}
                    </div>

        );
    }


}