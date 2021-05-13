import React = require("react");
import { observer } from "mobx-react";
import "./MainViewPopup.scss";
import { action, observable } from "mobx";

interface MainViewPopupProps {
    windowWidth: number;
    windowHeight: number;
}

@observer
export class MainViewPopup extends React.Component<{}> {

    constructor(props: Readonly<MainViewPopupProps>) {
        super(props);
        MainViewPopup.visible = false;
        MainViewPopup.wrapperRef = React.createRef();
        MainViewPopup.handleClickOutside = MainViewPopup.handleClickOutside.bind(this);
    }

    @observable public static wrapperRef = React.createRef<HTMLDivElement>();
    @observable public static content = <div>testing content</div>;
    @observable public static visible = false;
    @observable public static x = 0;
    @observable public static y = 0;
    @observable public static newAppearance = false;
    @observable public static width = 100;
    @observable public static height = 100;
    @observable public static backgroundColor = "white";

    @observable public static windowWidth: number = document.getElementById('root')?.clientWidth || 1000;
    @observable public static windowHeight: number = document.getElementById('root')?.clientHeight || 700;

    componentDidMount() {
        document.addEventListener('mousedown', MainViewPopup.handleClickOutside);
    }

    componentWillUnmount() {
        document.removeEventListener('mousedown', MainViewPopup.handleClickOutside);
    }

    @action
    public static handleClickOutside(event: { target: any; }) {
        if (MainViewPopup.wrapperRef.current && !MainViewPopup.wrapperRef.current.contains(event.target)) {
            if (!MainViewPopup.newAppearance) {
                console.log("outside click");
                MainViewPopup.visible = false;
                MainViewPopup.content = <></>;
            } else {
                MainViewPopup.newAppearance = false;
            }
        }
    }

    @action
    public static setWidth(width: number) { MainViewPopup.width = width; }

    @action
    public static setHeight(height: number) { MainViewPopup.height = height; }

    @action
    public static setBackgroundColor(color: string) { MainViewPopup.backgroundColor = color; }

    @action
    public static setX(x: number) {
        if (MainViewPopup.windowWidth < x + MainViewPopup.width) {
            MainViewPopup.x = MainViewPopup.windowWidth - MainViewPopup.width;
        } else {
            MainViewPopup.x = x;
        }
    }

    @action
    public static setY(y: number) {
        if (MainViewPopup.windowHeight < y + MainViewPopup.height) {
            MainViewPopup.y = MainViewPopup.windowHeight - MainViewPopup.height;
        } else {
            MainViewPopup.y = y;
        }
        console.log("main view width: " + MainViewPopup.windowWidth);
        console.log("main view height: " + MainViewPopup.windowWidth);
    }

    @action
    public static show() { MainViewPopup.visible = true; MainViewPopup.newAppearance = true; }

    @action
    public static hide() {
        MainViewPopup.content = <></>;
        MainViewPopup.visible = false;
        MainViewPopup.newAppearance = false;
    }

    @action
    public static changeContent(content: any) {
        MainViewPopup.content = <></>;
        MainViewPopup.content = content;
    }

    render() {
        return <div className="mainViewPopup" ref={MainViewPopup.wrapperRef}
            style={{
                display: MainViewPopup.visible ? "initial" : "none",
                left: MainViewPopup.x, top: MainViewPopup.y,
                width: MainViewPopup.width, height: MainViewPopup.height,
                backgroundColor: MainViewPopup.backgroundColor
            }}>
            {MainViewPopup.content}
        </div>;
    }
} 