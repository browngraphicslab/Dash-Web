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

    componentDidMount() {
        document.addEventListener('mousedown', MainViewPopup.handleClickOutside);
    }

    componentWillUnmount() {
        document.removeEventListener('mousedown', MainViewPopup.handleClickOutside);
    }

    @action
    public static handleClickOutside(event: { target: any; }) {
        if (MainViewPopup.wrapperRef.current && !MainViewPopup.wrapperRef.current.contains(event.target)) {
            MainViewPopup.visible = false;
        }
    }

    @action
    public static changeX(x: number) { MainViewPopup.x = x; }

    @action
    public static changeY(y: number) { MainViewPopup.y = y; }

    @action
    public static show() { MainViewPopup.visible = true; }

    @action
    public static hide() { MainViewPopup.visible = false; }

    @action
    public static changeContent(content: any) { MainViewPopup.content = content; }

    render() {
        return <div className="mainViewPopup" ref={MainViewPopup.wrapperRef}
            style={{
                display: MainViewPopup.visible ? "initial" : "none",
                left: MainViewPopup.x, right: MainViewPopup.y
            }}>
            {MainViewPopup.content}
        </div>;
    }
} 