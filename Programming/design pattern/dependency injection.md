# dependency injection

依赖注入能让一个对象接收它所依赖的其他对象。“依赖”是指接收方所需的对象。“注入”是指将“依赖”传递给接收方的过程。此模式确保了任何想要使用给定服务的对象不需要知道如何创建这些服务

编程语言层次下，“接收方”为对象和 class，“依赖”为变量。在提供服务的角度下，“接收方”为客户端，“依赖”为服务

该设计的目的是为了分离关注点，分离接收方和依赖，从而提供松耦合以及代码重用性
