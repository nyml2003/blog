import { definePage } from "../../../solid/page";
import { CategoryShelfPage } from "../components/category-shelf-page";
import "../../styles/app.css";

const App = () => <CategoryShelfPage title="分类浏览" />;

definePage(App);
