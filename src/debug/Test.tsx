import * as React from 'react';
import * as ReactDOM from 'react-dom';

class TestInternal extends React.Component {
    onContextMenu = (e: React.MouseEvent) => {
        console.log("Internal");
        e.stopPropagation();
    }

    onPointerDown = (e: React.MouseEvent) => {
        console.log("pointer down")
        e.preventDefault();
    }

    render() {
        return <div onContextMenu={this.onContextMenu} onPointerDown={this.onPointerDown}
            onPointerUp={this.onPointerDown}>Hello world</div>
    }
}

class TestChild extends React.Component {
    onContextMenu = () => {
        console.log("Child");
    }

    render() {
        return <div onContextMenu={this.onContextMenu}><TestInternal /></div>
    }
}

class TestParent extends React.Component {
    onContextMenu = () => {
        console.log("Parent");
    }

    render() {
        return <div onContextMenu={this.onContextMenu}><TestChild /></div>
    }
}

ReactDOM.render((
    <div style={{ position: "absolute", width: "100%", height: "100%" }}>
        <TestParent />
    </div>),
    document.getElementById('root')
);