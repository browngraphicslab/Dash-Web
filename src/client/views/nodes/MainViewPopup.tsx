import React = require("react");
import { observer } from "mobx-react";
import "./MainViewPopup.scss";
import { action, observable } from "mobx";

interface MainViewPopupProps {
    width: number;
    height: number;
    x: number;
    y: number;
    content: any;
}

@observer
export class MainViewPopup extends React.Component<{}> {

    constructor(props: Readonly<{}>) {
        super(props);
        MainViewPopup.visible = true;
        MainViewPopup.wrapperRef = React.createRef();
        MainViewPopup.handleClickOutside = MainViewPopup.handleClickOutside.bind(this);
    }

    @observable public static wrapperRef = React.createRef<HTMLDivElement>();
    @observable public static content = <div>testing content</div>;
    @observable public static visible = false;
    @observable public static x = 0;
    @observable public static y = 0;
    @observable public static newAppearance = false;

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
            } else {
                MainViewPopup.newAppearance = false;
            }
        }
    }

    @action
    public static setX(x: number) { MainViewPopup.x = x; }

    @action
    public static setY(y: number) { MainViewPopup.y = y; }

    @action
    public static show() { console.log("show"); MainViewPopup.visible = true; MainViewPopup.newAppearance = true; }

    @action
    public static hide() { console.log("hide"); MainViewPopup.visible = false; MainViewPopup.newAppearance = false; }

    @action
    public static changeContent(content: any) { MainViewPopup.content = content; }

    render() {
        return <div className="mainViewPopup" ref={MainViewPopup.wrapperRef}
            style={{
                display: MainViewPopup.visible ? "initial" : "none",
                left: MainViewPopup.x, top: MainViewPopup.y
            }}>
            {MainViewPopup.content}
        </div>;
    }
} 